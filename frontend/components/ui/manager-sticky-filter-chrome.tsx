import React, { useMemo } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { APP_MENU_BAR_STICKY_OFFSET } from '@/components/ui/manager-layout';
import { useColorPalette } from '@/lib/tenant/TenantThemeContext';

export type ManagerStickyFilterChromeProps = {
  children?: React.ReactNode;
  /**
   * Accessible name for the filter strip.
   * Defaults to "Filter controls".
   */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Shared sticky filter/toolbar chrome under AppMenuBar (web sticky; native best-effort).
 *
 * Renders nothing when there are no filter children (no empty sticky bar).
 *
 * ```
 * User -> ManagerScrollView : scroll manager page
 * ManagerScrollView -> AppMenuBar : sticky top of scrollport
 * ManagerScrollView -> ManagerStickyFilterChrome : sticky under menu (web)
 * ManagerStickyFilterChrome -> children : search / type filters
 * note overflow visible on page body so CSS sticky can work
 * ```
 */
export function ManagerStickyFilterChrome({
  children,
  accessibilityLabel = 'Filter controls',
  style,
  testID = 'manager-sticky-filter-chrome',
}: ManagerStickyFilterChromeProps) {
  const palette = useColorPalette();
  const content = React.Children.toArray(children).filter((child) => {
    if (child == null || child === false || child === true) {
      return false;
    }
    if (typeof child === 'string' && child.trim() === '') {
      return false;
    }
    return true;
  });

  const styles = useMemo(
    () =>
      StyleSheet.create({
        chrome: {
          width: '100%',
          gap: 8,
          paddingVertical: 8,
          backgroundColor: palette.background,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: palette.border,
          zIndex: 5,
          ...(Platform.OS === 'web'
            ? ({
                position: 'sticky',
                top: APP_MENU_BAR_STICKY_OFFSET,
              } as const)
            : {}),
        },
      }),
    [palette]
  );

  if (content.length === 0) {
    return null;
  }

  return (
    <View
      style={[styles.chrome, style]}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {content}
    </View>
  );
}
