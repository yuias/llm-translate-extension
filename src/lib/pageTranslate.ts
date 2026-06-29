// Tags whose text content must not be translated (code, scripts, form fields).
const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'CODE',
  'PRE',
  'KBD',
  'SAMP',
  'TEXTAREA',
  'svg',
]);

/**
 * Collect visible, translatable text nodes in document order. The TreeWalker
 * does not descend into shadow roots, so the extension's own overlay UI is
 * excluded automatically.
 */
export function collectTextNodes(root: Node = document.body): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent || SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      if (parent.isContentEditable) return NodeFilter.FILTER_REJECT;
      // Skip nodes that aren't actually rendered (display:none, etc.).
      if (typeof parent.checkVisibility === 'function' && !parent.checkVisibility()) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes: Text[] = [];
  let current: Node | null;
  while ((current = walker.nextNode())) nodes.push(current as Text);
  return nodes;
}

/**
 * Group nodes into batches bounded by character count and item count, keeping
 * each LLM request small enough to stay fast and within context limits.
 */
export function batchNodes(nodes: Text[], maxChars = 2000, maxItems = 40): Text[][] {
  const batches: Text[][] = [];
  let current: Text[] = [];
  let length = 0;

  for (const node of nodes) {
    const len = node.nodeValue?.length ?? 0;
    if (current.length > 0 && (length + len > maxChars || current.length >= maxItems)) {
      batches.push(current);
      current = [];
      length = 0;
    }
    current.push(node);
    length += len;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** Run async tasks with bounded concurrency, preserving result order. */
export async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function run(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]!, index);
    }
  }

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, run);
  await Promise.all(runners);
  return results;
}
