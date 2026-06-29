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

async function postChat(
  provider: Provider,
  messages: ChatMessage[],
  signal: AbortSignal | undefined,
  stream: boolean,
): Promise<Response> {
  const res = await fetch(provider.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({ model: provider.model, messages, stream, temperature: 0.2 }),
    signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new TranslationError(
      `LLM request failed (${res.status}): ${body.slice(0, 200)}`,
      res.status,
    );
  }
  return res;
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

/** Extract a JSON array from a model response, tolerating ```json fences. */
function parseJsonArray(content: string): unknown {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? content).trim();
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    throw new TranslationError('Model did not return a JSON array');
  }
  return JSON.parse(raw.slice(start, end + 1));
}

/**
 * Translate many short segments in a single request. Returns an array aligned
 * 1:1 with the input, so callers can map results back to their DOM nodes.
 */
export async function translateSegments(
  provider: Provider,
  segments: string[],
  target: LangCode,
  signal?: AbortSignal,
): Promise<string[]> {
  if (segments.length === 0) return [];
  const res = await postChat(
    provider,
    [
      { role: 'system', content: batchSystemPrompt(target) },
      { role: 'user', content: JSON.stringify(segments) },
    ],
    signal,
    false,
  );
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new TranslationError('Unexpected response shape from LLM');
  }
  const parsed = parseJsonArray(content);
  if (!Array.isArray(parsed) || parsed.length !== segments.length) {
    throw new TranslationError(
      `Batch size mismatch: expected ${segments.length}, got ${Array.isArray(parsed) ? parsed.length : 'non-array'}`,
    );
  }
  return parsed.map((v) => String(v));
}

/**
 * Translate a single chunk, yielding partial text as it streams in.
 * Parses Server-Sent Events from an OpenAI-compatible streaming response.
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
  if (!res.body) throw new TranslationError('Streaming not supported by endpoint');

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;

    // SSE frames are separated by double newlines; each "data:" line holds JSON.
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
