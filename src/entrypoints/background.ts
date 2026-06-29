export default defineBackground(() => {
  // Network calls to user-defined LLM endpoints run here in the service worker
  // to bypass page-level CORS restrictions. Message routing is added in Phase 2.
});
