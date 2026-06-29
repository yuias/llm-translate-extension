import { mount, unmount } from 'svelte';
import ContentApp from '../lib/components/ContentApp.svelte';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  // 'ui' injects component styles into the shadow root, isolating them from the page.
  cssInjectionMode: 'ui',
  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'llm-translate-ui',
      position: 'overlay',
      anchor: 'body',
      onMount: (container) => mount(ContentApp, { target: container }),
      onRemove: (app) => {
        if (app) unmount(app);
      },
    });
    ui.mount();
  },
});
