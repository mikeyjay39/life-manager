import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import {
  MANAGER_CONTENT_GAP,
  MANAGER_CONTENT_MAX_WIDTH,
  MANAGER_CONTENT_PADDING_X,
} from '@/components/ui/manager-layout';

export type ManagerPageContentProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Centers manager page body content with a shared max width.
 *
 * ```
 * Screen -> ManagerPageContent : wrap body
 * ManagerPageContent -> children : constrain width + align center
 * ```
 */
export function ManagerPageContent({
  children,
  style,
  testID,
}: ManagerPageContentProps) {
  return (
    <View style={[styles.root, style]} testID={testID}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    maxWidth: MANAGER_CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: MANAGER_CONTENT_PADDING_X,
    gap: MANAGER_CONTENT_GAP,
  },
});
