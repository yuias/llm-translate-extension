import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-svelte'],
  srcDir: 'src',
  // Drop the auto-injected <link rel="modulepreload">. Chrome flags it as a
  // "cross-world extension resource mismatch" for shared chunks, and the hint
  // gives no real benefit for locally-bundled extension pages.
  vite: () => ({
    build: { modulePreload: false },
  }),
  manifest: {
    name: 'LLM Translate',
    description: 'Translate selected text or whole pages with an OpenAI-compatible LLM',
    // Permissions kept minimal; arbitrary LLM endpoints are granted at runtime
    // via optional_host_permissions when a provider is added.
    permissions: ['storage', 'activeTab', 'contextMenus'],
    optional_host_permissions: ['https://*/*', 'http://*/*'],
  },
});
