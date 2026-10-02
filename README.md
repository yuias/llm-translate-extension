# llm-translate-extension

A Chrome/Edge (Manifest V3) extension that translates text using any
OpenAI-compatible LLM endpoint. Built with [WXT](https://wxt.dev), Vite, and
Svelte 5 + TypeScript.

## Features

- **Selection translation** — select text on any page, click the floating
  button, and read the translation in a resizable, scrollable popup. The
  result streams in as it is generated.
- **Full-page translation** — translate a whole page in place, preserving its
  layout. Toggle back to the original instantly.
- **Bring your own model** — add/remove multiple OpenAI-compatible providers
  (endpoint, model, API key, display name) and switch the active one. An
  optional extra JSON request body per provider passes vendor-specific options;
  see [Reasoning models](#reasoning-models).
- **Tone** — keep the original register, or rewrite it as polite, business,
  casual, an X post, or plain language.
- **Languages** — translate into any of the G7 languages plus Chinese and
  Russian. Source language is auto-detected.

## Reasoning models

Reasoning ("thinking") models spend time reasoning before they emit any
translated text, which can take minutes. The selection popup shows
"Thinking…" during that phase. To shorten it, put the provider's own reasoning
option in the provider's **Extra request body (JSON)** field. The field name
differs per API:

| API | Disable reasoning | Reduce reasoning |
| --- | --- | --- |
| OpenAI | — | `{"reasoning_effort":"low"}` |
| OpenRouter | `{"reasoning":{"enabled":false}}` | `{"reasoning":{"effort":"low"}}` or `{"reasoning":{"max_tokens":512}}` |
| Zhipu GLM (direct) | `{"thinking":{"type":"disabled"}}` | — |

Notes:

- Some models cannot turn reasoning off. OpenRouter then answers
  `400 Reasoning is mandatory for this endpoint and cannot be disabled`; use a
  reduce option instead, or a non-reasoning model for translation.
- OpenRouter can attach server tools (such as `openrouter:datetime`) from
  account or preset settings even though this extension never sends `tools`.
  If a request fails with `Server tool "openrouter:…" failed`, turn those tools
  off for the key or preset you use here.
- Use **Test connection** in the provider form to check a body before saving.
  An unrecognized field is either ignored (no speed-up) or rejected with 400.

## Privacy & permissions

- API keys are stored in `chrome.storage.local` only and are **never synced**.
- The extension ships with no broad host access. When you add a provider, host
  permission for that endpoint's origin is requested at runtime
  (`optional_host_permissions`).
- LLM requests are made from the background service worker, so page CORS
  policies don't block user-defined endpoints.

## Development

```bash
pnpm install      # also runs `wxt prepare`
pnpm dev          # launch Chrome with HMR
pnpm dev:firefox
pnpm compile      # type-check (svelte-check)
pnpm build        # production build into .output/
pnpm zip          # package for store upload
```

After `pnpm build`, load `.output/chrome-mv3` via
`chrome://extensions` → *Load unpacked*.

## Architecture

| Area | Location | Notes |
| --- | --- | --- |
| Background | `src/entrypoints/background.ts` | Streaming port + batch message handler |
| Content overlay | `src/lib/components/ContentApp.svelte` | Mounted in a shadow root; selection UI + page translation |
| Options | `src/entrypoints/options/` | Provider CRUD, target language, tone, popup size |
| Popup | `src/entrypoints/popup/` | Active provider, language, tone, page toggle |
| LLM client | `src/lib/translator.ts` | Chat completions: single, streaming, and JSON-array batch, with retry/backoff and timeouts |
| Page DOM | `src/lib/pageTranslate.ts` | Text-node collection, batching, concurrency pool |

### Why client-side batching instead of the Batch API

The OpenAI Batch API is asynchronous with a turnaround measured in minutes to
hours — unusable for an on-demand "translate this page" action. Full-page
translation instead collects text nodes, groups them into small character-
bounded batches, and sends ordinary chat-completion requests (bounded
concurrency), mapping each JSON-array result back to its source node.

## Licence

[MIT](LICENSE)
