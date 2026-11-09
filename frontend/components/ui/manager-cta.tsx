import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Button, type ButtonProps } from '@/components/ui/button';
import {
  MANAGER_CTA_MAX_WIDTH,
  MANAGER_CTA_MIN_HEIGHT,
  MANAGER_CTA_MIN_WIDTH,
} from '@/components/ui/manager-layout';

export type ManagerCtaProps = ButtonProps & {
  /** When true, CTA fills the parent width (no max-width cap). Default false. */
  fullWidth?: boolean;
  wrapperStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Manager CTA wrapper around Button. Constrains width by default so primary
 * actions do not stretch edge-to-edge on wide web viewports.
 *
 * ```
 * Form -> ManagerCta : primary / secondary action
 * ManagerCta -> Button : themed pressable
 * ```
 */
export function ManagerCta({
  fullWidth = false,
  wrapperStyle,
  style,
  testID,
  ...buttonProps
}: ManagerCtaProps) {
  return (
    <View
      style={[fullWidth ? styles.fullWidthWrap : styles.constrainedWrap, wrapperStyle]}
      testID={testID}
    >
      <Button {...buttonProps} style={[styles.buttonFill, style]} />
    </View>
  );
}

const styles = StyleSheet.create({
  constrainedWrap: {
    alignSelf: 'flex-start',
    width: '100%',
    maxWidth: MANAGER_CTA_MAX_WIDTH,
    minWidth: MANAGER_CTA_MIN_WIDTH,
  },
  fullWidthWrap: {
    alignSelf: 'stretch',
    width: '100%',
  },
  buttonFill: {
    width: '100%',
    minHeight: MANAGER_CTA_MIN_HEIGHT,
  },
});
