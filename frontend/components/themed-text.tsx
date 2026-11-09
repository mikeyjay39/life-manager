import { Text, type TextProps } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';
import { useColorPalette } from '@/lib/tenant/TenantThemeContext';
import { typeStyle, type TypeRole } from '@/lib/tenant/theme/typography';

/** Legacy aliases map onto product type roles. */
export type ThemedTextType =
  | TypeRole
  | 'default'
  | 'title'
  | 'subtitle'
  | 'defaultSemiBold'
  | 'link';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: ThemedTextType;
};

function resolveRole(type: ThemedTextType): TypeRole | 'defaultSemiBold' | 'link' {
  switch (type) {
    case 'title':
    case 'pageTitle':
      return 'pageTitle';
    case 'subtitle':
    case 'sectionTitle':
      return 'sectionTitle';
    case 'meta':
      return 'meta';
    case 'defaultSemiBold':
      return 'defaultSemiBold';
    case 'link':
      return 'link';
    case 'body':
    case 'default':
    default:
      return 'body';
  }
}

/**
 * Themed text helper wired to the product typography scale.
 *
 * ```
 * Caller -> ThemedText(type) : pick role or legacy alias
 * ThemedText -> resolveRole : map alias to TypeRole
 * ThemedText -> typeStyle / body+bold / link : apply scale + product sans
 * ThemedText -> useThemeColor / palette : text or muted / tint
 * ```
 */
export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'body',
  ...rest
}: ThemedTextProps) {
  const role = resolveRole(type);
  const palette = useColorPalette();
  const colorName = role === 'meta' ? 'muted' : 'text';
  const color = useThemeColor({ light: lightColor, dark: darkColor }, colorName);

  const roleStyle =
    role === 'link'
      ? [typeStyle('body'), { color: palette.tint, lineHeight: 30 }]
      : role === 'defaultSemiBold'
        ? [typeStyle('body'), { fontWeight: '600' as const }]
        : typeStyle(role);

  return (
    <Text
      style={[{ color }, roleStyle, style]}
      {...rest}
    />
  );
}
