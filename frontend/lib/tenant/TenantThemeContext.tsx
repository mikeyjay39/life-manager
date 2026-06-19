import React, { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  DarkTheme,
  DefaultTheme,
  type Theme as NavigationTheme,
} from '@react-navigation/native';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTenant } from '@/lib/tenant/TenantContext';
import { mergeTenantTheme } from '@/lib/tenant/theme/merge-theme';
import type {
  ColorPalette,
  ResolvedTenantTheme,
  TenantBranding,
} from '@/lib/tenant/theme/types';

type TenantThemeContextValue = ResolvedTenantTheme;

const TenantThemeContext = createContext<TenantThemeContextValue | undefined>(undefined);

type TenantThemeProviderProps = {
  children: ReactNode;
};

export function TenantThemeProvider({ children }: TenantThemeProviderProps) {
  const {
    tenant: { theme: tenantTheme },
  } = useTenant();

  const resolved = useMemo(() => mergeTenantTheme(tenantTheme), [tenantTheme]);

  return (
    <TenantThemeContext.Provider value={resolved}>{children}</TenantThemeContext.Provider>
  );
}

function useResolvedTenantTheme(): ResolvedTenantTheme {
  const context = useContext(TenantThemeContext);
  if (context === undefined) {
    throw new Error('useResolvedTenantTheme must be used within a TenantThemeProvider');
  }
  return context;
}

export function useColorPalette(): ColorPalette {
  const scheme = useColorScheme() ?? 'light';
  const { colors } = useResolvedTenantTheme();
  return colors[scheme];
}

export function useTenantBranding(): TenantBranding {
  const { headerBackground, copy, assets } = useResolvedTenantTheme();
  return { headerBackground, copy, assets };
}

export function useThemeColorValue(
  props: { light?: string; dark?: string },
  colorName: keyof ColorPalette
): string {
  const scheme = useColorScheme() ?? 'light';
  const { colors } = useResolvedTenantTheme();
  const colorFromProps = props[scheme];
  if (colorFromProps) {
    return colorFromProps;
  }
  return colors[scheme][colorName];
}

export function useNavigationTheme(): NavigationTheme {
  const scheme = useColorScheme() ?? 'light';
  const { colors } = useResolvedTenantTheme();
  const palette = colors[scheme];
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;

  return {
    ...base,
    colors: {
      ...base.colors,
      primary: palette.tint,
      background: palette.background,
      card: palette.background,
      text: palette.text,
      border: palette.icon,
    },
  };
}

/** Test helper: provide a fixed resolved theme without TenantProvider. */
export function TenantThemeTestProvider({
  theme,
  children,
}: {
  theme: ResolvedTenantTheme;
  children: ReactNode;
}) {
  return <TenantThemeContext.Provider value={theme}>{children}</TenantThemeContext.Provider>;
}
