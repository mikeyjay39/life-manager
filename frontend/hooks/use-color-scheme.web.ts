import { useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

import {
  getBrowserColorScheme,
  resolveColorScheme,
  type ColorSchemeName,
} from '@/hooks/color-scheme';

/**
 * Web: prefer browser prefers-color-scheme; fall back to RN/OS.
 * Returns 'light' until hydrated for static SSR.
 */
export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);
  const [browserScheme, setBrowserScheme] = useState<ColorSchemeName | null>(null);
  const osScheme = useRNColorScheme();

  useEffect(() => {
    setHasHydrated(true);
    setBrowserScheme(getBrowserColorScheme());

    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }

    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setBrowserScheme(getBrowserColorScheme());
    darkQuery.addEventListener('change', onChange);
    return () => darkQuery.removeEventListener('change', onChange);
  }, []);

  if (!hasHydrated) {
    return 'light';
  }

  return resolveColorScheme(browserScheme, osScheme);
}
