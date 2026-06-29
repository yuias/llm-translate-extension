import { browser } from 'wxt/browser';

/** Convert an endpoint URL into an origin match pattern, e.g. https://api.x.com/*. */
export function originPattern(endpoint: string): string | null {
  try {
    return `${new URL(endpoint).origin}/*`;
  } catch {
    return null;
  }
}

export async function hasEndpointPermission(endpoint: string): Promise<boolean> {
  const origin = originPattern(endpoint);
  if (!origin) return false;
  return browser.permissions.contains({ origins: [origin] });
}

/**
 * Request host permission for a provider's endpoint origin. Must be called from
 * a user gesture (e.g. a button click) or the browser rejects it silently.
 */
export async function requestEndpointPermission(endpoint: string): Promise<boolean> {
  const origin = originPattern(endpoint);
  if (!origin) return false;
  if (await browser.permissions.contains({ origins: [origin] })) return true;
  return browser.permissions.request({ origins: [origin] });
}
