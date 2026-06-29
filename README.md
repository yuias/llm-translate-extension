# LLM Translate

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
  (endpoint, model, API key, display name) and switch the active one.
- **Languages** — translate into any of the G7 languages plus Chinese and
  Russian. Source language is auto-detected.

## Privacy & permissions

- API keys are stored in `chrome.storage.local` only and are **never synced**.
- The extension ships with no broad host access. When you add a provider, host
  permission for that endpoint's origin is requested at runtime
  (`optional_host_permissions`).
- LLM requests are made from the background service worker, so page CORS
  policies don't block user-defined endpoints.

## Development

```bash
npm install        # also runs `wxt prepare`
npm run dev        # launch Chrome with HMR
npm run dev:firefox
npm run compile    # type-check (svelte-check)
npm run build      # production build into .output/
npm run zip        # package for store upload
```

After `npm run build`, load `.output/chrome-mv3` via
`chrome://extensions` → *Load unpacked*.

## Architecture

| Area | Location | Notes |
| --- | --- | --- |
| Background | `src/entrypoints/background.ts` | Streaming port + batch message handler |
| Content overlay | `src/lib/components/ContentApp.svelte` | Mounted in a shadow root; selection UI + page translation |
| Options | `src/entrypoints/options/` | Provider CRUD, target language, popup size |
| Popup | `src/entrypoints/popup/` | Active provider, language, page toggle |
| LLM client | `src/lib/translator.ts` | Chat completions: single, streaming, and JSON-array batch, with retry/backoff |
| Page DOM | `src/lib/pageTranslate.ts` | Text-node collection, batching, concurrency pool |

### Why client-side batching instead of the Batch API

The OpenAI Batch API is asynchronous with a turnaround measured in minutes to
hours — unusable for an on-demand "translate this page" action. Full-page
translation instead collects text nodes, groups them into small character-
bounded batches, and sends ordinary chat-completion requests (bounded
concurrency), mapping each JSON-array result back to its source node.
