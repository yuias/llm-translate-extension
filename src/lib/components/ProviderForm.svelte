<script lang="ts">
  import { untrack } from 'svelte';
  import { requestEndpointPermission } from '../permissions';
  import { translateText } from '../translator';
  import type { Provider } from '../types';

  interface Props {
    provider: Provider;
    onsave: (provider: Provider) => void;
    oncancel: () => void;
  }
  let { provider, onsave, oncancel }: Props = $props();

  // Editable working copy so cancel discards changes. Captured once on mount;
  // the parent remounts this form per provider, so we intentionally untrack.
  let draft = $state<Provider>(untrack(() => ({ ...provider })));

  type TestState = { kind: 'idle' | 'testing' | 'ok' | 'error'; message?: string };
  let test = $state<TestState>({ kind: 'idle' });

  const canSave = $derived(
    draft.displayName.trim() !== '' &&
      draft.endpoint.trim() !== '' &&
      draft.model.trim() !== '',
  );

  async function runTest() {
    test = { kind: 'testing' };
    try {
      const granted = await requestEndpointPermission(draft.endpoint);
      if (!granted) {
        test = { kind: 'error', message: 'Host permission was denied for this endpoint.' };
        return;
      }
      const out = await translateText(draft, 'Hello, world.', 'ja');
      test = { kind: 'ok', message: out.slice(0, 60) };
    } catch (e) {
      test = { kind: 'error', message: e instanceof Error ? e.message : String(e) };
    }
  }

  async function save() {
    if (!canSave) return;
    // Proactively request endpoint permission so translation works later.
    await requestEndpointPermission(draft.endpoint);
    onsave({ ...draft, displayName: draft.displayName.trim(), endpoint: draft.endpoint.trim() });
  }
</script>

<form class="card" onsubmit={(e) => (e.preventDefault(), save())}>
  <div class="grid">
    <label>
      <span>Display name</span>
      <input bind:value={draft.displayName} placeholder="My GPT-4o" />
    </label>
    <label>
      <span>Model</span>
      <input bind:value={draft.model} placeholder="gpt-4o-mini" />
    </label>
    <label class="full">
      <span>Endpoint (chat completions URL)</span>
      <input bind:value={draft.endpoint} placeholder="https://api.openai.com/v1/chat/completions" />
    </label>
    <label class="full">
      <span>API key</span>
      <input type="password" bind:value={draft.apiKey} placeholder="sk-…" autocomplete="off" />
    </label>
  </div>

  {#if test.kind !== 'idle'}
    <p class="test {test.kind}">
      {#if test.kind === 'testing'}Testing…{/if}
      {#if test.kind === 'ok'}✓ Connected — “{test.message}”{/if}
      {#if test.kind === 'error'}✗ {test.message}{/if}
    </p>
  {/if}

  <div class="actions">
    <button type="button" class="ghost" onclick={runTest} disabled={!canSave || test.kind === 'testing'}>
      Test connection
    </button>
    <span class="spacer"></span>
    <button type="button" class="ghost" onclick={oncancel}>Cancel</button>
    <button type="submit" class="primary" disabled={!canSave}>Save</button>
  </div>
</form>

<style>
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12px;
    color: var(--text-muted);
  }
  label.full {
    grid-column: 1 / -1;
  }
  input {
    background: var(--surface-2);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 9px 11px;
    font-size: 14px;
  }
  input:focus {
    outline: none;
    border-color: var(--accent);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .spacer {
    flex: 1;
  }
  .test {
    margin: 0;
    font-size: 13px;
    word-break: break-word;
  }
  .test.ok {
    color: #4ade80;
  }
  .test.error {
    color: var(--danger);
  }
  .test.testing {
    color: var(--text-muted);
  }
  button {
    border-radius: 8px;
    padding: 9px 14px;
    font-size: 13px;
    font-weight: 600;
    border: 1px solid transparent;
  }
  .primary {
    background: var(--accent);
    color: white;
  }
  .primary:hover:not(:disabled) {
    background: var(--accent-hover);
  }
  .ghost {
    background: transparent;
    border-color: var(--border);
    color: var(--text);
  }
  .ghost:hover:not(:disabled) {
    border-color: var(--accent);
  }
  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>
