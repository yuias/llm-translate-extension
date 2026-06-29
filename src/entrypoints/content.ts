export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    // Selection button + translation popup are added in Phase 2.
  },
});
