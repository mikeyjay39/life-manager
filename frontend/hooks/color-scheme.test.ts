import { afterEach, describe, expect, it, vi } from 'vitest';

import { getBrowserColorScheme, resolveColorScheme } from '@/hooks/color-scheme';

describe('resolveColorScheme', () => {
  it('given browser dark and OS light when resolving then prefers browser', () => {
    expect(resolveColorScheme('dark', 'light')).toBe('dark');
  });

  it('given browser null and OS dark when resolving then falls back to OS', () => {
    expect(resolveColorScheme(null, 'dark')).toBe('dark');
  });

  it('given both null when resolving then returns null', () => {
    expect(resolveColorScheme(null, null)).toBeNull();
  });
});

describe('getBrowserColorScheme', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('given dark media query matches when reading then returns dark', () => {
    // Given
    vi.stubGlobal('window', {
      matchMedia: (query: string) => ({
        matches: query === '(prefers-color-scheme: dark)',
      }),
    });

    // When / Then
    expect(getBrowserColorScheme()).toBe('dark');
  });

  it('given light matches and dark does not when reading then returns light', () => {
    // Given
    vi.stubGlobal('window', {
      matchMedia: (query: string) => ({
        matches: query === '(prefers-color-scheme: light)',
      }),
    });

    // When / Then
    expect(getBrowserColorScheme()).toBe('light');
  });

  it('given neither media query matches when reading then returns null', () => {
    // Given
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false }),
    });

    // When / Then
    expect(getBrowserColorScheme()).toBeNull();
  });

  it('given matchMedia unavailable when reading then returns null', () => {
    // Given
    vi.stubGlobal('window', {});

    // When / Then
    expect(getBrowserColorScheme()).toBeNull();
  });
});
