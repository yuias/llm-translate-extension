<script lang="ts">
  import { browser } from 'wxt/browser';
  import { LANGUAGES } from '../../lib/languages';
  import type { PageCommand, PageState } from '../../lib/messaging';
  import { settings } from '../../lib/settings.svelte';
  import { applyTheme } from '../../lib/theme';
  import { DEFAULT_THEME, type Settings } from '../../lib/types';

  // Keep the popup scheme in sync with the saved preference.
  $effect(() => applyTheme(settings.value?.theme ?? DEFAULT_THEME));

  // 'unavailable' = no content script on this tab (e.g. chrome:// pages).
  let pageState = $state<PageState | 'unavailable'>('unavailable');

  const activeProvider = $derived(
    settings.value?.providers.find((p) => p.id === settings.value?.activeProviderId) ??
      settings.value?.providers[0] ??
      null,
  );

  async function activeTabId(): Promise<number | undefined> {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return tab?.id;
  }

  async function sendToPage<T = void>(command: PageCommand): Promise<T | undefined> {
    const id = await activeTabId();
    if (id === undefined) return undefined;
    try {
      return (await browser.tabs.sendMessage(id, command)) as T;
    } catch {
      return undefined; // content script not present on this page
    }
  }

  $effect(() => {
    sendToPage<PageState>({ type: 'getPageState' }).then((state) => {
      if (state) pageState = state;
    });
  });

  async function togglePage() {
    if (pageState === 'translated') {
      await sendToPage({ type: 'restorePage' });
      pageState = 'original';
    } else {
      await sendToPage({ type: 'translatePage' });
      pageState = 'translating';
      window.close(); // progress is shown in-page; free to dismiss the popup
    }
  }

  async function onLangChange(code: string) {
    if (!settings.value) return;
    await settings.save({ ...$state.snapshot(settings.value), targetLang: code as Settings['targetLang'] });
  }

  function openOptions() {
    browser.runtime.openOptionsPage();
  }
</script>

<main>
  <header>
    <h1>LLM Translate</h1>
    <button class="icon" title="Settings" onclick={openOptions} aria-label="Settings">⚙</button>
  </header>

  {#if settings.value}
    <label class="field">
      <span>Translate into</span>
      <select value={settings.value.targetLang} onchange={(e) => onLangChange(e.currentTarget.value)}>
        {#each LANGUAGES as lang}
          <option value={lang.code}>{lang.label} · {lang.native}</option>
        {/each}
      </select>
    </label>

    <div class="provider">
      {#if activeProvider}
        <span class="dot ok"></span>
        <span>{activeProvider.displayName} <em>({activeProvider.model})</em></span>
      {:else}
        <span class="dot warn"></span>
        <span>No provider configured — <button class="link" onclick={openOptions}>add one</button></span>
      {/if}
    </div>

    <button
      class="primary"
      disabled={!activeProvider || pageState === 'unavailable' || pageState === 'translating'}
      onclick={togglePage}
    >
      {#if pageState === 'translated'}Show original
      {:else if pageState === 'translating'}Translating…
      {:else}Translate this page{/if}
    </button>
  {:else}
    <p class="muted">Loading…</p>
  {/if}
</main>

<style>
  main {
    width: 320px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h1 {
    font-size: 15px;
    margin: 0;
    font-weight: 600;
  }
  .icon {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 16px;
  }
  .icon:hover {
    color: var(--text);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12px;
    color: var(--text-muted);
  }
  select {
    background: var(--surface-2);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 8px 10px;
    font-size: 14px;
  }
  .provider {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--text-muted);
  }
  .provider em {
    color: var(--text-muted);
    font-style: normal;
    opacity: 0.7;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .dot.ok {
    background: #4ade80;
  }
  .dot.warn {
    background: var(--danger);
  }
  .primary {
    background: var(--accent);
    color: white;
    border: none;
    border-radius: var(--radius);
    padding: 10px;
    font-weight: 600;
    font-size: 14px;
  }
  .primary:hover:not(:disabled) {
    background: var(--accent-hover);
  }
  .primary:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .link {
    background: none;
    border: none;
    color: var(--accent);
    padding: 0;
    text-decoration: underline;
  }
  .muted {
    color: var(--text-muted);
  }
</style>
