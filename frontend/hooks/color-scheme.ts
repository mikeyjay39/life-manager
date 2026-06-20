export type ColorSchemeName = 'light' | 'dark';

/** Read browser preference; null when unavailable or no-preference. */
export function getBrowserColorScheme(): ColorSchemeName | null {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return null;
  }

  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }

  if (window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }

  return null;
}

/** Browser wins when present; otherwise OS/RN scheme. */
export function resolveColorScheme(
  browser: ColorSchemeName | null | undefined,
  os: ColorSchemeName | null | undefined
): ColorSchemeName | null {
  return browser ?? os ?? null;
}
