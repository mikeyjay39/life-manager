import type { TextStyle } from 'react-native';

import { Fonts } from '@/constants/theme';

/**
 * Product typography roles for manager UI.
 *
 * ```
 * Screen -> ThemedText(type) : resolve role
 * ThemedText -> typeStyle(role) : size/weight/lineHeight + product sans
 * typeStyle -> Fonts.sans : web stack / native platform font
 * ```
 */
export type TypeRole = 'pageTitle' | 'sectionTitle' | 'body' | 'meta';

/** Size and weight for each type role (shared on web and native). */
export const TYPE_SCALE: Record<
  TypeRole,
  Pick<TextStyle, 'fontSize' | 'fontWeight' | 'lineHeight'>
> = {
  pageTitle: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 34,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 24,
  },
  body: {
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
  },
  meta: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
  },
};

/** Product sans: web CSS stack; native platform default via Fonts. */
export function productSansFamily(): string {
  return Fonts.sans;
}

/** Full text style for a type role (includes product sans). */
export function typeStyle(role: TypeRole): TextStyle {
  return {
    ...TYPE_SCALE[role],
    fontFamily: productSansFamily(),
  };
}
