import { useThemeColorValue } from '@/lib/tenant/TenantThemeContext';
import type { ColorPalette } from '@/lib/tenant/theme/types';

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof ColorPalette
) {
  return useThemeColorValue(props, colorName);
}
