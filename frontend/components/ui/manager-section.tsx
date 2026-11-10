import React, { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import {
  MANAGER_SECTION_GAP,
  MANAGER_SECTION_PADDING,
  MANAGER_SECTION_TOOLBAR_GAP,
} from '@/components/ui/manager-layout';
import { useColorPalette } from '@/lib/tenant/TenantThemeContext';
import { withAlpha } from '@/lib/tenant/theme/color-utils';

const SECTION_BORDER_ALPHA = 0.35;

/** Structured primary or secondary control for the section toolbar. */
export type ManagerSectionAction = {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
  disabled?: boolean;
  loading?: boolean;
};

export type ManagerSectionProps = {
  title: string;
  children: React.ReactNode;
  /**
   * Primary Add/Create in the section action area (filled).
   * Renders on the trailing side in LTR so the title stays opposite.
   */
  primaryAction?: ManagerSectionAction;
  /**
   * Quieter secondary controls (outline). Rendered before the primary action.
   */
  secondaryActions?: ManagerSectionAction[];
  /**
   * Extra toolbar content (for example include-inactive Switch).
   * Placed with secondary actions, before the primary Add.
   */
  toolbarExtra?: React.ReactNode;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Shared manager section chrome: title left, optional toolbar actions right,
 * then body. Primary Add uses filled styling; secondary uses outline.
 *
 * ```
 * Screen -> ManagerSection : title + optional toolbar + body
 * ManagerSection -> ThemedText : section title (leading, LTR)
 * ManagerSection -> actions : secondary outline then primary fill (trailing)
 * ManagerSection -> children : body content
 * note narrow widths wrap actions under the title without overlap
 * ```
 */
export function ManagerSection({
  title,
  children,
  primaryAction,
  secondaryActions,
  toolbarExtra,
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

  const hasActions =
    primaryAction != null ||
    (secondaryActions != null && secondaryActions.length > 0) ||
    toolbarExtra != null;

  return (
    <View
      style={[styles.section, themed, style]}
      accessibilityLabel={accessibilityLabel ?? `${title} section`}
      testID={testID}
    >
      <View style={styles.header} testID={testID ? `${testID}-header` : undefined}>
        <ThemedText
          type="sectionTitle"
          accessibilityRole="header"
          style={styles.title}
        >
          {title}
        </ThemedText>
        {hasActions ? (
          <View
            style={styles.actions}
            accessibilityLabel={`${title} actions`}
            testID={testID ? `${testID}-actions` : undefined}
          >
            {toolbarExtra}
            {secondaryActions?.map((action) => (
              <Button
                key={action.accessibilityLabel ?? action.label}
                variant="outline"
                label={action.label}
                onPress={action.onPress}
                disabled={action.disabled}
                loading={action.loading}
                accessibilityLabel={action.accessibilityLabel ?? action.label}
                style={styles.toolbarButton}
              />
            ))}
            {primaryAction ? (
              <Button
                variant="primary"
                label={primaryAction.label}
                onPress={primaryAction.onPress}
                disabled={primaryAction.disabled}
                loading={primaryAction.loading}
                accessibilityLabel={
                  primaryAction.accessibilityLabel ?? primaryAction.label
                }
                style={styles.toolbarButton}
              />
            ) : null}
          </View>
        ) : null}
      </View>
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
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: MANAGER_SECTION_TOOLBAR_GAP,
    width: '100%',
  },
  title: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 120,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: MANAGER_SECTION_TOOLBAR_GAP,
    flexGrow: 1,
    flexShrink: 1,
  },
  toolbarButton: {
    alignSelf: 'flex-start',
  },
  body: {
    gap: MANAGER_SECTION_GAP,
  },
});
