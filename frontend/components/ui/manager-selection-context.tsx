import React, { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import {
  MANAGER_SELECTION_ACCENT_WIDTH,
  MANAGER_SELECTION_BORDER_WIDTH,
  MANAGER_SELECTION_FILL_ALPHA,
} from '@/components/ui/manager-selection';
import { useColorPalette } from '@/lib/tenant/TenantThemeContext';
import { withAlpha } from '@/lib/tenant/theme/color-utils';

export type ManagerSelectionContextProps = {
  /** Domain noun for a11y, e.g. HealthMember or Car. */
  entityNoun: string;
  /** Display label when an entity is selected; null when none. */
  selectedLabel: string | null;
  /** Extra hint when nothing is selected. */
  emptyHint?: string;
  /** Mark selected entity as inactive in copy. */
  inactive?: boolean;
  /** Override computed accessibility label when needed. */
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Compact selection context for dependent manager panels.
 *
 * ```
 * [Activity]
 * if selectedLabel
 *   Show "Selected: Name" chip with tint accent
 * else
 *   Show empty "No {entity} selected" surface + optional hint
 * end
 * ```
 */
export function ManagerSelectionContext({
  entityNoun,
  selectedLabel,
  emptyHint,
  inactive = false,
  accessibilityLabel: accessibilityLabelProp,
  testID,
  style,
}: ManagerSelectionContextProps) {
  const palette = useColorPalette();
  const hasSelection = selectedLabel != null && selectedLabel.trim() !== '';

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          alignSelf: 'flex-start',
          maxWidth: '100%',
          borderRadius: 8,
          paddingVertical: 8,
          paddingHorizontal: 12,
          gap: 2,
        },
        selected: {
          borderWidth: MANAGER_SELECTION_BORDER_WIDTH,
          borderColor: palette.tint,
          borderLeftWidth: MANAGER_SELECTION_ACCENT_WIDTH,
          backgroundColor: withAlpha(palette.tint, MANAGER_SELECTION_FILL_ALPHA),
        },
        empty: {
          borderWidth: 1,
          borderColor: palette.border,
          borderStyle: 'dashed',
          backgroundColor: palette.surface,
        },
        label: {
          color: hasSelection ? palette.tint : palette.muted,
          fontWeight: hasSelection ? '700' : '500',
        },
        hint: {
          color: palette.muted,
        },
      }),
    [hasSelection, palette]
  );

  const defaultAccessibilityLabel = hasSelection
    ? inactive
      ? `Selected ${entityNoun} ${selectedLabel} (inactive)`
      : `Selected ${entityNoun} ${selectedLabel}`
    : emptyHint
      ? `No ${entityNoun} selected. ${emptyHint}`
      : `No ${entityNoun} selected`;

  const primaryText = hasSelection
    ? inactive
      ? `Selected: ${selectedLabel} (inactive)`
      : `Selected: ${selectedLabel}`
    : `No ${entityNoun} selected`;

  return (
    <View
      style={[styles.root, hasSelection ? styles.selected : styles.empty, style]}
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabelProp ?? defaultAccessibilityLabel}
      testID={testID ?? 'manager-selection-context'}
    >
      <ThemedText type="body" style={styles.label}>
        {primaryText}
      </ThemedText>
      {!hasSelection && emptyHint ? (
        <ThemedText type="meta" style={styles.hint}>
          {emptyHint}
        </ThemedText>
      ) : null}
    </View>
  );
}
