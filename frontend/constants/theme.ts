/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const defaultColors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    onTint: '#fff',
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
    surface: '#f2f4f5',
    // ≥3:1 vs background/surface for control outlines (WCAG 1.4.11).
    border: '#687076',
    muted: '#687076',
    success: '#2e7d32',
    warning: '#ed6c02',
    danger: '#c62828',
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    onTint: '#151718',
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
    surface: '#1c1e1f',
    // ≥3:1 vs background/surface for control outlines (WCAG 1.4.11).
    border: '#9BA1A6',
    muted: '#9BA1A6',
    success: '#81c784',
    warning: '#ffb74d',
    danger: '#ef5350',
  },
} as const;

/** @deprecated Prefer useColorPalette() in UI code. Kept for tests and non-React modules. */
export const Colors = defaultColors;

/**
 * Product font families. Manager UI uses `sans` only (not decorative display).
 * Web: CSS sans stack with system fallbacks. Native: platform default family.
 */
export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    /** Product sans for manager UI — system UI stack, not a display face. */
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
})!;
