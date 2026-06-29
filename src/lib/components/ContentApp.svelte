<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from 'wxt/browser';
  import { DEFAULT_LANG, languageLabel } from '../languages';
  import { TRANSLATE_PORT, type StreamMessage } from '../messaging';
  import { settings } from '../settings.svelte';
  import { DEFAULT_POPUP_SIZE } from '../types';

  type Point = { x: number; y: number };
  type Status = 'idle' | 'loading' | 'streaming' | 'done' | 'error';

  let button = $state<Point | null>(null);
  let selectedText = $state('');
  let popup = $state<Point | null>(null);
  let result = $state('');
  let status = $state<Status>('idle');
  let errorMsg = $state('');

  let port: ReturnType<typeof browser.runtime.connect> | null = null;

  const size = $derived(settings.value?.popupSize ?? DEFAULT_POPUP_SIZE);
  const targetLang = $derived(settings.value?.targetLang ?? DEFAULT_LANG);

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
    port.postMessage({ text, targetLang });
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

  onMount(() => {
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('scroll', onScroll, true);
    document.addEventListener('keydown', onKeydown);
    return () => {
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('keydown', onKeydown);
      port?.disconnect();
    };
  });
</script>

<div class="root">
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
</div>

<style>
  .root {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 2147483647;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
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
    background: #6d8bff;
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
    background: #5a78f0;
  }
  .popup {
    display: flex;
    flex-direction: column;
    background: #181b22;
    color: #e6e8ec;
    border: 1px solid #2c313c;
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
    border-bottom: 1px solid #2c313c;
    flex-shrink: 0;
  }
  .lang {
    font-size: 12px;
    color: #9aa3b2;
  }
  .head-actions {
    display: flex;
    gap: 4px;
  }
  .icon {
    background: none;
    border: none;
    color: #9aa3b2;
    cursor: pointer;
    font-size: 13px;
    padding: 2px 4px;
    border-radius: 4px;
  }
  .icon:hover {
    color: #e6e8ec;
    background: #20242d;
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
    color: #9aa3b2;
  }
  .error {
    color: #ff6b6b;
  }
  .cursor {
    display: inline-block;
    width: 7px;
    height: 1.05em;
    background: #6d8bff;
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
