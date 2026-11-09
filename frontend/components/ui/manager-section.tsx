import React, { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import {
  MANAGER_SECTION_GAP,
  MANAGER_SECTION_PADDING,
} from '@/components/ui/manager-layout';
import { useColorPalette } from '@/lib/tenant/TenantThemeContext';
import { withAlpha } from '@/lib/tenant/theme/color-utils';

const SECTION_BORDER_ALPHA = 0.35;

export type ManagerSectionProps = {
  title: string;
  children: React.ReactNode;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Shared manager section chrome: title + body with common spacing and border.
 *
 * ```
 * Screen -> ManagerSection : title + body
 * ManagerSection -> ThemedText : section title
 * ManagerSection -> children : body content
 * ```
 */
export function ManagerSection({
  title,
  children,
  accessibilityLabel,
  style,
  testID,
}: ManagerSectionProps) {
  const palette = useColorPalette();

  const themed = useMemo(
    () => ({
      borderColor: withAlpha(palette.icon, SECTION_BORDER_ALPHA),
      backgroundColor: palette.background,
    }),
    [palette]
  );

  return (
    <View
      style={[styles.section, themed, style]}
      accessibilityLabel={accessibilityLabel ?? `${title} section`}
      testID={testID}
    >
      <ThemedText type="sectionTitle" accessibilityRole="header">
        {title}
      </ThemedText>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    width: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: MANAGER_SECTION_PADDING,
    gap: MANAGER_SECTION_GAP,
  },
  body: {
    gap: MANAGER_SECTION_GAP,
  },
});
