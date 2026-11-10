import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MANAGER_PAGE_HEADER_GAP } from '@/components/ui/manager-layout';
import { useColorPalette } from '@/lib/tenant/TenantThemeContext';

export type ManagerPageHeaderProps = {
  title: string;
  subtitle?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Compact manager page header: title and optional subtitle under the menu.
 * No parallax or header image.
 *
 * ```
 * Screen -> ManagerPageHeader : title [+ subtitle]
 * ManagerPageHeader -> ThemedText : render title
 * opt subtitle
 *   ManagerPageHeader -> ThemedText : render subtitle (muted)
 * end
 * ```
 */
export function ManagerPageHeader({
  title,
  subtitle,
  style,
  testID,
}: ManagerPageHeaderProps) {
  const palette = useColorPalette();

  return (
    <View style={[styles.root, style]} testID={testID}>
      <ThemedText type="pageTitle" accessibilityRole="header">
        {title}
      </ThemedText>
      {subtitle ? (
        <ThemedText type="meta" style={{ color: palette.muted }}>
          {subtitle}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: MANAGER_PAGE_HEADER_GAP,
  },
});
