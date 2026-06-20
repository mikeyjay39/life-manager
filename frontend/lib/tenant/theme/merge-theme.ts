import {
  defaultHeaderBackground,
  defaultResolvedTheme,
  defaultThemeAssets,
  defaultThemeCopy,
} from '@/lib/tenant/theme/defaults';
import type { ResolvedTenantTheme, TenantTheme } from '@/lib/tenant/theme/types';

export function mergeTenantTheme(tenantTheme?: TenantTheme): ResolvedTenantTheme {
  if (!tenantTheme) {
    return defaultResolvedTheme;
  }

  return {
    colors: {
      light: { ...defaultResolvedTheme.colors.light, ...tenantTheme.light },
      dark: { ...defaultResolvedTheme.colors.dark, ...tenantTheme.dark },
    },
    headerBackground: tenantTheme.headerBackground ?? defaultHeaderBackground,
    copy: {
      loginSubtitle: tenantTheme.copy?.loginSubtitle ?? defaultThemeCopy.loginSubtitle,
      homeTitleSuffix: tenantTheme.copy?.homeTitleSuffix ?? defaultThemeCopy.homeTitleSuffix,
    },
    assets: {
      logo: tenantTheme.assets?.logo ?? defaultThemeAssets.logo,
      headerImage: tenantTheme.assets?.headerImage ?? defaultThemeAssets.headerImage,
    },
  };
}
