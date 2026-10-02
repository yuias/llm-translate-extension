<script lang="ts">
  import { browser } from 'wxt/browser';
  import ProviderForm from '../../lib/components/ProviderForm.svelte';
  import { LANGUAGES } from '../../lib/languages';
  import { settings } from '../../lib/settings.svelte';
  import { applyTheme } from '../../lib/theme';
  import { TONES } from '../../lib/tones';
  import { DEFAULT_THEME, type Provider, type Settings } from '../../lib/types';

  // The provider currently being added/edited, or null when the list is shown.
  let editing = $state<Provider | null>(null);

  const version = browser.runtime.getManifest().version;
  const gitHash = __GIT_HASH__;

  // Keep the document scheme in sync with the saved preference.
  $effect(() => applyTheme(settings.value?.theme ?? DEFAULT_THEME));

  function newProvider(): Provider {
    return { id: crypto.randomUUID(), displayName: '', endpoint: '', model: '', apiKey: '' };
  }

  async function update(mutate: (s: Settings) => void) {
    if (!settings.value) return;
    const next = structuredClone($state.snapshot(settings.value)) as Settings;
    mutate(next);
    await settings.save(next);
  }

  function onSave(provider: Provider) {
    update((s) => {
      const idx = s.providers.findIndex((p) => p.id === provider.id);
      if (idx >= 0) s.providers[idx] = provider;
      else s.providers.push(provider);
      // First provider added becomes the active one automatically.
      if (!s.activeProviderId) s.activeProviderId = provider.id;
    });
    editing = null;
  }

  function remove(id: string) {
    update((s) => {
      s.providers = s.providers.filter((p) => p.id !== id);
      if (s.activeProviderId === id) s.activeProviderId = s.providers[0]?.id ?? null;
    });
  }
</script>

<main>
  <header>
    <h1>LLM Translate</h1>
    <p class="muted">Configure the models used for translation.</p>
  </header>

  {#if settings.value}
    {@const s = settings.value}

    <section>
      <h2>General</h2>
      <label class="row">
        <span>Default target language</span>
        <select
          value={s.targetLang}
          onchange={(e) => update((d) => (d.targetLang = e.currentTarget.value as Settings['targetLang']))}
        >
          {#each LANGUAGES as lang}
            <option value={lang.code}>{lang.label} · {lang.native}</option>
          {/each}
        </select>
      </label>
      <label class="row">
        <span>Tone</span>
        <select
          value={s.tone}
          onchange={(e) => update((d) => (d.tone = e.currentTarget.value as Settings['tone']))}
        >
          {#each TONES as t}
            <option value={t.id} title={t.hint}>{t.label}</option>
          {/each}
        </select>
      </label>
      <p class="muted hint">{TONES.find((t) => t.id === s.tone)?.hint}</p>
      <label class="row">
        <span>Theme</span>
        <select
          value={s.theme}
          onchange={(e) => update((d) => (d.theme = e.currentTarget.value as Settings['theme']))}
        >
          <option value="system">System</option>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </label>
    </section>

    <section>
      <h2>Translation popup</h2>
      <div class="popup-size">
        <label class="row">
          <span>Width: {s.popupSize.width}px</span>
          <input
            type="range"
            min="240"
            max="1024"
            step="10"
            value={s.popupSize.width}
            oninput={(e) => update((d) => (d.popupSize.width = e.currentTarget.valueAsNumber))}
          />
        </label>
        <label class="row">
          <span>Height: {s.popupSize.height}px</span>
          <input
            type="range"
            min="160"
            max="1024"
            step="10"
            value={s.popupSize.height}
            oninput={(e) => update((d) => (d.popupSize.height = e.currentTarget.valueAsNumber))}
          />
        </label>
        <p class="muted hint">You can also drag the popup's corner to resize it; the new size is saved.</p>
      </div>
    </section>

    <section>
      <div class="section-head">
        <h2>Providers</h2>
        {#if !editing}
          <button class="primary" onclick={() => (editing = newProvider())}>+ Add provider</button>
        {/if}
      </div>

      {#if editing}
        <ProviderForm provider={editing} onsave={onSave} oncancel={() => (editing = null)} />
      {:else if s.providers.length === 0}
        <p class="muted empty">No providers yet. Add an OpenAI-compatible endpoint to start.</p>
      {:else}
        <ul class="providers">
          {#each s.providers as p (p.id)}
            <li class="provider" class:active={p.id === s.activeProviderId}>
              <label class="pick">
                <input
                  type="radio"
                  name="active"
                  checked={p.id === s.activeProviderId}
                  onchange={() => update((d) => (d.activeProviderId = p.id))}
                />
              </label>
              <div class="info">
                <strong>{p.displayName}</strong>
                <span class="meta">{p.model} · {p.endpoint}</span>
              </div>
              <div class="row-actions">
                <button class="ghost" onclick={() => (editing = { ...p })}>Edit</button>
                <button class="ghost danger" onclick={() => remove(p.id)}>Delete</button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {:else}
    <p class="muted">Loading…</p>
  {/if}

  <footer class="version muted">v{version} ({gitHash})</footer>
</main>

<style>
  main {
    max-width: 760px;
    margin: 0 auto;
    padding: 40px 24px 80px;
    display: flex;
    flex-direction: column;
    gap: 28px;
  }
  header h1 {
    font-size: 22px;
    margin: 0 0 4px;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  h2 {
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
    margin: 0;
  }
  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  select {
    background: var(--surface-2);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 9px 11px;
    font-size: 14px;
    min-width: 220px;
  }
  .providers {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .provider {
    display: flex;
    align-items: center;
    gap: 14px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px 16px;
  }
  .provider.active {
    border-color: var(--accent);
  }
  .info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }
  .meta {
    font-size: 12px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row-actions {
    display: flex;
    gap: 8px;
  }
  .muted {
    color: var(--text-muted);
  }
  .version {
    margin: 0;
    text-align: right;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .popup-size {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .popup-size input[type='range'] {
    width: 320px;
    accent-color: var(--accent);
  }
  .hint {
    font-size: 12px;
    margin: 4px 0 0;
  }
  .empty {
    padding: 24px;
    text-align: center;
    border: 1px dashed var(--border);
    border-radius: var(--radius);
  }
  button {
    border-radius: 8px;
    padding: 8px 13px;
    font-size: 13px;
    font-weight: 600;
    border: 1px solid transparent;
  }
  .primary {
    background: var(--accent);
    color: white;
  }
  .primary:hover {
    background: var(--accent-hover);
  }
  .ghost {
    background: transparent;
    border-color: var(--border);
    color: var(--text);
  }
  .ghost:hover {
    border-color: var(--accent);
  }
  .ghost.danger:hover {
    border-color: var(--danger);
    color: var(--danger);
  }
</style>
