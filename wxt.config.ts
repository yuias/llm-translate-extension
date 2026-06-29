import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-svelte'],
  srcDir: 'src',
  manifest: {
    name: 'LLM Translate',
    description: 'Translate selected text or whole pages with an OpenAI-compatible LLM',
    // Permissions kept minimal; arbitrary LLM endpoints are granted at runtime
    // via optional_host_permissions when a provider is added.
    permissions: ['storage', 'activeTab', 'contextMenus'],
    optional_host_permissions: ['https://*/*', 'http://*/*'],
  },
});
