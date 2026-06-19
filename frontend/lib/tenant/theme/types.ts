import type { ImageSourcePropType } from 'react-native';

export type ColorPalette = {
  text: string;
  background: string;
  tint: string;
  onTint: string;
  icon: string;
  tabIconDefault: string;
  tabIconSelected: string;
};

export type ColorSchemePalettes = {
  light: ColorPalette;
  dark: ColorPalette;
};

export type HeaderBackground = {
  light: string;
  dark: string;
};

export type TenantThemeCopy = {
  loginSubtitle: string;
  homeTitleSuffix: string;
};

export type TenantThemeAssets = {
  logo: ImageSourcePropType;
  headerImage: ImageSourcePropType;
};

/** Optional per-tenant branding overrides — unspecified fields use app defaults. */
export type TenantTheme = {
  light?: Partial<ColorPalette>;
  dark?: Partial<ColorPalette>;
  headerBackground?: HeaderBackground;
  copy?: {
    loginSubtitle?: string;
    homeTitleSuffix?: string;
  };
  assets?: {
    logo?: ImageSourcePropType;
    headerImage?: ImageSourcePropType;
  };
};

export type ResolvedTenantTheme = {
  colors: ColorSchemePalettes;
  headerBackground: HeaderBackground;
  copy: TenantThemeCopy;
  assets: TenantThemeAssets;
};

export type TenantBranding = {
  headerBackground: HeaderBackground;
  copy: TenantThemeCopy;
  assets: TenantThemeAssets;
};
