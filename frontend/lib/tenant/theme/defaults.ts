import type {
  ColorSchemePalettes,
  HeaderBackground,
  ResolvedTenantTheme,
  TenantThemeCopy,
} from '@/lib/tenant/theme/types';
import { defaultColors } from '@/constants/theme';
import { defaultThemeAssets } from '@/lib/tenant/theme/default-assets';

export const defaultHeaderBackground: HeaderBackground = {
  light: '#A1CEDC',
  dark: '#1D3D47',
};

export const defaultThemeCopy: TenantThemeCopy = {
  loginSubtitle: 'Sign in to continue',
  homeTitleSuffix: '!',
};

export const defaultResolvedTheme: ResolvedTenantTheme = {
  colors: defaultColors,
  headerBackground: defaultHeaderBackground,
  copy: defaultThemeCopy,
  assets: defaultThemeAssets,
};

export function getDefaultColorPalettes(): ColorSchemePalettes {
  return defaultColors;
}

export { defaultThemeAssets };
