<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from 'wxt/browser';
  import { DEFAULT_LANG, languageLabel } from '../languages';
  import {
    TRANSLATE_PORT,
    type PageCommand,
    type PageState,
    type StreamMessage,
  } from '../messaging';
  import { batchNodes, collectTextNodes, runPool } from '../pageTranslate';
  import { settings } from '../settings.svelte';
  import { DEFAULT_POPUP_SIZE, DEFAULT_THEME } from '../types';

  type Point = { x: number; y: number };
  type Status = 'idle' | 'loading' | 'streaming' | 'done' | 'error';

  let button = $state<Point | null>(null);
  let selectedText = $state('');
  let popup = $state<Point | null>(null);
  let result = $state('');
  let status = $state<Status>('idle');
  let errorMsg = $state('');

  let port: ReturnType<typeof browser.runtime.connect> | null = null;

  // --- Full-page translation state ---
  let pageState = $state<PageState>('original');
  let progress = $state({ done: 0, total: 0 });
  let pageError = $state('');
  let cancelled = false;
  const originals = new Map<Text, string>();
  // Open streaming ports — one per in-flight batch — tracked so we can tear
  // them all down on cancel/unmount.
  const pagePorts = new Set<ReturnType<typeof browser.runtime.connect>>();

  const size = $derived(settings.value?.popupSize ?? DEFAULT_POPUP_SIZE);
  const targetLang = $derived(settings.value?.targetLang ?? DEFAULT_LANG);
  // Shadow DOM is isolated from the document root, so scope the theme here.
  const theme = $derived(settings.value?.theme ?? DEFAULT_THEME);

  function currentSelection(): { text: string; rect: DOMRect } | null {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? '';
    if (!sel || !text || sel.rangeCount === 0) return null;
    return { text, rect: sel.getRangeAt(0).getBoundingClientRect() };
  }

  function onMouseUp() {
    // Defer so the browser finalizes the selection before we read it.
    setTimeout(() => {
      const cur = currentSelection();
      if (!cur) return;
      selectedText = cur.text;
      button = { x: cur.rect.left + cur.rect.width / 2, y: cur.rect.bottom };
    }, 0);
  }

  function onSelectionChange() {
    if (!window.getSelection()?.toString().trim()) button = null;
  }

  function onScroll() {
    button = null; // viewport-anchored, so it would drift on scroll
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') closePopup();
  }

  /** Place a w×h panel near an anchor, clamped to the viewport. */
  function place(anchor: Point, w: number, h: number): Point {
    const m = 8;
    let x = anchor.x - w / 2;
    let y = anchor.y + m;
    x = Math.max(m, Math.min(x, window.innerWidth - w - m));
    if (y + h > window.innerHeight - m) y = Math.max(m, anchor.y - h - m * 2);
    return { x, y };
  }

  function translate() {
    if (!button || !selectedText) return;
    popup = place(button, size.width, size.height);
    button = null;
    result = '';
    errorMsg = '';
    status = 'loading';
    startStream(selectedText);
  }

  function startStream(text: string) {
    port?.disconnect();
    port = browser.runtime.connect({ name: TRANSLATE_PORT });
    port.onMessage.addListener((msg: StreamMessage) => {
      if (msg.type === 'chunk') {
        status = 'streaming';
        result += msg.delta;
      } else if (msg.type === 'done') {
        status = 'done';
      } else if (msg.type === 'error') {
        status = 'error';
        errorMsg = msg.message;
      }
    });
    port.postMessage({ kind: 'text', text, targetLang });
  }

  function closePopup() {
    port?.disconnect();
    port = null;
    popup = null;
    status = 'idle';
    result = '';
  }

  async function copyResult() {
    if (result) await navigator.clipboard.writeText(result).catch(() => {});
  }

  // Persist manual corner-drag resizes back to settings (debounced).
  function persistSize(el: HTMLElement) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver(() => {
      const width = Math.round(el.offsetWidth);
      const height = Math.round(el.offsetHeight);
      const cur = settings.value?.popupSize;
      if (!cur || (Math.abs(cur.width - width) < 2 && Math.abs(cur.height - height) < 2)) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (settings.value) {
          settings.save({ ...$state.snapshot(settings.value), popupSize: { width, height } });
        }
      }, 300);
    });
    ro.observe(el);
    return {
      destroy() {
        ro.disconnect();
        clearTimeout(timer);
      },
    };
  }

  async function translatePage() {
    if (pageState === 'translating') return;
    const nodes = collectTextNodes();
    if (nodes.length === 0) return;

    cancelled = false;
    pageError = '';
    progress = { done: 0, total: nodes.length };
    pageState = 'translating';

    const batches = batchNodes(nodes);

    await runPool(batches, 3, (batch) => streamBatch(batch));

    if (cancelled) {
      restorePage();
      return;
    }
    pageState = originals.size > 0 ? 'translated' : 'original';
    const failed = progress.total - progress.done;
    if (failed > 0 && !pageError) pageError = `${failed} segment(s) could not be translated.`;
  }

  /**
   * Stream one batch over its own port, applying each segment to its DOM node
   * the moment it arrives. Resolves when the batch finishes, errors, or cancels.
   */
  function streamBatch(batch: Text[]): Promise<void> {
    return new Promise((resolve) => {
      if (cancelled) return resolve();
      const segments = batch.map((n) => n.nodeValue ?? '');
      const p = browser.runtime.connect({ name: TRANSLATE_PORT });
      pagePorts.add(p);
      const applied: Text[] = []; // nodes this batch mutated, for rollback on error
      const seen = new Set<number>(); // segment ids already applied (guard repeats)
      const finish = () => {
        pagePorts.delete(p);
        p.disconnect();
        resolve();
      };
      p.onMessage.addListener((msg: StreamMessage) => {
        if (cancelled) return finish();
        if (msg.type === 'segment') {
          const node = batch[msg.index];
          if (node && !seen.has(msg.index)) {
            seen.add(msg.index);
            if (!originals.has(node)) originals.set(node, node.nodeValue ?? '');
            node.nodeValue = msg.text;
            applied.push(node);
            progress = { ...progress, done: progress.done + 1 };
          }
        } else if (msg.type === 'done') {
          finish();
        } else if (msg.type === 'error') {
          pageError = msg.message;
          // A failed batch is all-or-nothing: undo its partial in-place edits so
          // the page never shows a half-translated batch.
          for (const node of applied) {
            const original = originals.get(node);
            if (original !== undefined) {
              node.nodeValue = original;
              originals.delete(node);
            }
          }
          progress = { ...progress, done: progress.done - applied.length };
          finish();
        }
      });
      p.postMessage({ kind: 'batch', segments, targetLang });
    });
  }

  function restorePage() {
    cancelled = true;
    for (const [node, text] of originals) node.nodeValue = text;
    originals.clear();
    pageState = 'original';
    progress = { done: 0, total: 0 };
    pageError = '';
  }

  function onPageCommand(
    msg: PageCommand,
    _sender: unknown,
    sendResponse: (state: PageState) => void,
  ): boolean | undefined {
    if (msg?.type === 'translatePage') {
      translatePage();
    } else if (msg?.type === 'restorePage') {
      restorePage();
    } else if (msg?.type === 'getPageState') {
      sendResponse(pageState);
    }
    return undefined;
  }

  onMount(() => {
    browser.runtime.onMessage.addListener(onPageCommand);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('scroll', onScroll, true);
    document.addEventListener('keydown', onKeydown);
    return () => {
      browser.runtime.onMessage.removeListener(onPageCommand);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('keydown', onKeydown);
      port?.disconnect();
    };
  });
</script>

<div class="root" data-theme={theme}>
  {#if button}
    <button
      class="trigger"
      style="left:{button.x - 16}px; top:{button.y + 6}px"
      onmousedown={(e) => e.preventDefault()}
      onclick={translate}
      title="Translate selection"
      aria-label="Translate selection"
    >
      {targetLang.toUpperCase()}
    </button>
  {/if}

  {#if popup}
    <div
      class="popup"
      use:persistSize
      style="left:{popup.x}px; top:{popup.y}px; width:{size.width}px; height:{size.height}px"
    >
      <header>
        <span class="lang">→ {languageLabel(targetLang)}</span>
        <div class="head-actions">
          <button class="icon" onclick={copyResult} title="Copy" aria-label="Copy">⧉</button>
          <button class="icon" onclick={closePopup} title="Close" aria-label="Close">✕</button>
        </div>
      </header>
      <div class="body">
        {#if status === 'loading'}
          <span class="muted">Translating…</span>
        {:else if status === 'error'}
          <span class="error">{errorMsg}</span>
        {:else}
          <span class="result">{result}</span>{#if status === 'streaming'}<span class="cursor"></span>{/if}
        {/if}
      </div>
    </div>
  {/if}

  {#if pageState === 'translating'}
    <div class="banner">
      <span class="spinner"></span>
      <span>Translating page… {progress.done}/{progress.total}</span>
      <button class="banner-btn" onclick={restorePage}>Cancel</button>
    </div>
  {:else if pageState === 'translated'}
    <div class="pill">
      {#if pageError}<span class="pill-warn" title={pageError}>⚠</span>{/if}
      <button class="banner-btn" onclick={restorePage}>Show original</button>
    </div>
  {/if}
</div>

<style>
  .root {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 2147483647;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    /* Dark is the base; the data-theme attribute (set from settings) and the
       OS media query below switch to light, mirroring theme.css. */
    --c-surface: #181b22;
    --c-surface-2: #20242d;
    --c-text: #e6e8ec;
    --c-muted: #9aa3b2;
    --c-border: #2c313c;
    --c-accent: #6d8bff;
    --c-accent-hover: #5a78f0;
    --c-danger: #ff6b6b;
    --c-warn: #ffb86b;
    --c-spinner-track: #3a4150;
  }
  .root[data-theme='light'] {
    --c-surface: #ffffff;
    --c-surface-2: #eef0f4;
    --c-text: #1b1e24;
    --c-muted: #69707d;
    --c-border: #d7dbe2;
    --c-accent: #4763d6;
    --c-accent-hover: #3a53bd;
    --c-danger: #d83a3a;
    --c-warn: #c2740a;
    --c-spinner-track: #d7dbe2;
  }
  @media (prefers-color-scheme: light) {
    .root:not([data-theme='dark']) {
      --c-surface: #ffffff;
      --c-surface-2: #eef0f4;
      --c-text: #1b1e24;
      --c-muted: #69707d;
      --c-border: #d7dbe2;
      --c-accent: #4763d6;
      --c-accent-hover: #3a53bd;
      --c-danger: #d83a3a;
      --c-warn: #c2740a;
      --c-spinner-track: #d7dbe2;
    }
  }
  .trigger,
  .popup {
    position: fixed;
    pointer-events: auto;
  }
  .trigger {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: var(--c-accent);
    color: white;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.5px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .trigger:hover {
    background: var(--c-accent-hover);
  }
  .popup {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    background: var(--c-surface);
    color: var(--c-text);
    border: 1px solid var(--c-border);
    border-radius: 10px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.45);
    overflow: hidden;
    resize: both;
    min-width: 220px;
    min-height: 120px;
    font-size: 14px;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    border-bottom: 1px solid var(--c-border);
    flex-shrink: 0;
  }
  .lang {
    font-size: 12px;
    color: var(--c-muted);
  }
  .head-actions {
    display: flex;
    gap: 4px;
  }
  .icon {
    background: none;
    border: none;
    color: var(--c-muted);
    cursor: pointer;
    font-size: 13px;
    padding: 2px 4px;
    border-radius: 4px;
  }
  .icon:hover {
    color: var(--c-text);
    background: var(--c-surface-2);
  }
  .body {
    padding: 12px;
    overflow: auto;
    flex: 1;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .muted {
    color: var(--c-muted);
  }
  .error {
    color: var(--c-danger);
  }
  .banner {
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--c-surface);
    color: var(--c-text);
    border: 1px solid var(--c-border);
    border-radius: 999px;
    padding: 8px 8px 8px 16px;
    font-size: 13px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
  }
  .pill {
    position: fixed;
    bottom: 20px;
    right: 20px;
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: 999px;
    padding: 6px 8px 6px 12px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
  }
  .pill-warn {
    color: var(--c-warn);
    cursor: help;
  }
  .banner-btn {
    background: var(--c-accent);
    color: white;
    border: none;
    border-radius: 999px;
    padding: 5px 12px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .banner-btn:hover {
    background: var(--c-accent-hover);
  }
  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--c-spinner-track);
    border-top-color: var(--c-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .cursor {
    display: inline-block;
    width: 7px;
    height: 1.05em;
    background: var(--c-accent);
    margin-left: 1px;
    vertical-align: text-bottom;
    animation: blink 1s steps(2, start) infinite;
  }
  @keyframes blink {
    50% {
      opacity: 0;
    }
  }
</style>
