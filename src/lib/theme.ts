import type { ThemeMode } from './types';

/**
 * Reflect the chosen theme onto the document root. The CSS in theme.css keys
 * off `data-theme`: only an explicit 'dark'/'light' overrides the OS scheme,
 * so 'system' (and the initial unset state) transparently follows the OS.
 */
export function applyTheme(theme: ThemeMode): void {
  document.documentElement.dataset.theme = theme;
}
