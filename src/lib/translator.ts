import { languageLabel, type LangCode } from './languages';
import type { Provider } from './types';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class TranslationError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'TranslationError';
  }
}

function systemPrompt(target: LangCode): string {
  // Source language is intentionally unconstrained so the model auto-detects it.
  return [
    `You are a professional translator. Translate the user's text into ${languageLabel(target)}.`,
    'Detect the source language automatically.',
    'Preserve meaning, tone, and inline formatting. Do not add explanations or quotes.',
    'If the text is already in the target language, return it unchanged.',
  ].join(' ');
}

const MAX_RETRIES = 3;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

/** Backoff for a retryable response, honoring Retry-After when present. */
function retryDelayMs(res: Response, attempt: number): number {
  const retryAfter = res.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1000;
  }
  return Math.min(1000 * 2 ** attempt, 8000);
}

/**
 * Accept either a full chat-completions URL or just the API base URL
 * (e.g. https://api.openai.com/v1) and normalize to the former at request time.
 */
function resolveEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, '');
  return /\/chat\/completions$/.test(trimmed) ? trimmed : `${trimmed}/chat/completions`;
}

async function postChat(
  provider: Provider,
  messages: ChatMessage[],
  signal: AbortSignal | undefined,
  stream: boolean,
): Promise<Response> {
  const url = resolveEndpoint(provider.endpoint);
  // Retry transient failures (rate limits, upstream 5xx) with backoff.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({ model: provider.model, messages, stream, temperature: 0.2 }),
      signal,
    });
    if (res.ok) return res;

    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < MAX_RETRIES) {
      await sleep(retryDelayMs(res, attempt), signal);
      continue;
    }

    const body = await res.text().catch(() => '');
    throw new TranslationError(
      `LLM request failed (${res.status}): ${body.slice(0, 200)}`,
      res.status,
    );
  }
}

/** Translate a single chunk of text, returning the full result at once. */
export async function translateText(
  provider: Provider,
  text: string,
  target: LangCode,
  signal?: AbortSignal,
): Promise<string> {
  const res = await postChat(
    provider,
    [
      { role: 'system', content: systemPrompt(target) },
      { role: 'user', content: text },
    ],
    signal,
    false,
  );
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new TranslationError('Unexpected response shape from LLM');
  }
  return content.trim();
}

function batchSystemPrompt(target: LangCode): string {
  return [
    `You are a professional translator. You receive a JSON array of strings.`,
    `Translate each element into ${languageLabel(target)}, auto-detecting the source language.`,
    `Return ONLY a JSON array of strings of the SAME length and order — no prose, no code fences.`,
    `Preserve each element's leading and trailing whitespace.`,
    `If an element is already in the target language, return it unchanged.`,
  ].join(' ');
}

/**
 * Yield content deltas from an OpenAI-compatible streaming (SSE) response.
 * Shared by the single-text and batch streaming paths.
 */
async function* streamDeltas(res: Response): AsyncGenerator<string, void, void> {
  if (!res.body) throw new TranslationError('Streaming not supported by endpoint');

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;

    // SSE frames are newline-delimited; each "data:" line holds a JSON chunk.
    let nl: number;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') return;
      try {
        const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) yield delta;
      } catch {
        // Ignore keep-alive comments and malformed partial frames.
      }
    }
  }
}

/**
 * Incremental parser for a streamed JSON array of strings. Fed raw content
 * deltas, it emits each element the instant its closing quote arrives — so
 * callers can render translations as they complete instead of waiting for the
 * whole array. Assumes a flat array of strings (the batch response shape).
 */
class JsonArrayStream {
  private started = false; // seen the opening '['
  private done = false; // seen the closing ']'
  private inString = false;
  private escaped = false; // previous char was a backslash inside a string
  private raw = ''; // chars of the current element, still JSON-escaped

  /** Feed a delta; return any elements that completed within it. */
  push(chunk: string): string[] {
    const out: string[] = [];
    for (const ch of chunk) {
      if (this.done) break;
      if (this.inString) {
        if (this.escaped) {
          // Keep the escape sequence intact so JSON.parse can decode it.
          this.raw += '\\' + ch;
          this.escaped = false;
        } else if (ch === '\\') {
          this.escaped = true;
        } else if (ch === '"') {
          this.inString = false;
          out.push(this.flush());
        } else {
          this.raw += ch;
        }
      } else if (ch === '"' && this.started) {
        this.inString = true;
      } else if (ch === '[') {
        this.started = true;
      } else if (ch === ']') {
        this.done = true;
      }
    }
    return out;
  }

  /** Decode the collected element, tolerating odd escaping over dropping it. */
  private flush(): string {
    const raw = this.raw;
    this.raw = '';
    try {
      return JSON.parse(`"${raw}"`);
    } catch {
      return raw;
    }
  }
}

/**
 * Translate a single chunk, yielding partial text as it streams in.
 */
export async function* translateTextStream(
  provider: Provider,
  text: string,
  target: LangCode,
  signal?: AbortSignal,
): AsyncGenerator<string, void, void> {
  const res = await postChat(
    provider,
    [
      { role: 'system', content: systemPrompt(target) },
      { role: 'user', content: text },
    ],
    signal,
    true,
  );
  yield* streamDeltas(res);
}

/**
 * Translate many short segments in one streaming request, yielding each result
 * as soon as the model finishes it. Emitted indexes are 0-based and ordered, so
 * callers map them straight back to the input array (and their DOM nodes).
 */
export async function* translateSegmentsStream(
  provider: Provider,
  segments: string[],
  target: LangCode,
  signal?: AbortSignal,
): AsyncGenerator<{ index: number; text: string }, void, void> {
  if (segments.length === 0) return;
  const res = await postChat(
    provider,
    [
      { role: 'system', content: batchSystemPrompt(target) },
      { role: 'user', content: JSON.stringify(segments) },
    ],
    signal,
    true,
  );
  const parser = new JsonArrayStream();
  let index = 0;
  for await (const delta of streamDeltas(res)) {
    for (const text of parser.push(delta)) {
      yield { index: index++, text };
    }
  }
}
