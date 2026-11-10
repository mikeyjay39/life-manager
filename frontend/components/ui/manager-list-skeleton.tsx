import React, { useMemo } from 'react';
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useColorPalette } from '@/lib/tenant/TenantThemeContext';
import { withAlpha } from '@/lib/tenant/theme/color-utils';

/** Default skeleton row count for an empty list first load. */
export const MANAGER_LIST_SKELETON_DEFAULT_ROWS = 5;

/** Dense row vertical padding (matches document grid cells). */
const SKELETON_ROW_PADDING_Y = 10;

/** Dense row horizontal padding. */
const SKELETON_ROW_PADDING_X = 10;

/** Placeholder bar height inside a dense skeleton row. */
const SKELETON_BAR_HEIGHT = 12;

export type ManagerSkeletonBlockProps = {
  /** Flex grow relative to sibling bars in a row. */
  flex?: number;
  /** Fixed width when the bar should not grow. */
  width?: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Single themed skeleton bar for dense list placeholders.
 */
export function ManagerSkeletonBlock({
  flex = 1,
  width,
  testID,
  style,
}: ManagerSkeletonBlockProps) {
  const palette = useColorPalette();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        bar: {
          height: SKELETON_BAR_HEIGHT,
          borderRadius: 4,
          backgroundColor: withAlpha(palette.muted, 0.45),
          flex: width == null ? flex : undefined,
          width,
        },
      }),
    [flex, palette.muted, width]
  );

  return <View testID={testID} style={[styles.bar, style]} />;
}

export type ManagerSkeletonRowProps = {
  /** Bar flex weights left-to-right (suggests dense columns). */
  columns?: number[];
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * One dense skeleton row with column-like bars.
 */
export function ManagerSkeletonRow({
  columns = [2, 3, 1],
  testID,
  style,
}: ManagerSkeletonRowProps) {
  const palette = useColorPalette();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingVertical: SKELETON_ROW_PADDING_Y,
          paddingHorizontal: SKELETON_ROW_PADDING_X,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: palette.border,
          backgroundColor: palette.surface,
        },
      }),
    [palette.border, palette.surface]
  );

  return (
    <View testID={testID} style={[styles.row, style]}>
      {columns.map((flex, index) => (
        <ManagerSkeletonBlock
          key={`skeleton-col-${index}`}
          flex={flex}
          testID={testID ? `${testID}-bar-${index}` : undefined}
        />
      ))}
    </View>
  );
}

export type ManagerListSkeletonProps = {
  /** Number of dense placeholder rows. */
  rows?: number;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Dense list skeleton for initial empty→loading manager results.
 *
 * ```
 * [Activity]
 * Screen -> ListSkeleton : empty cache + fetch starts
 * ListSkeleton -> User : dense row placeholders
 * if fetch ok
 *   ListSkeleton clears; rows or empty state render
 * else
 *   ListSkeleton clears; error state renders
 * end
 * note refresh with existing rows keeps rows (no wipe to skeletons)
 * ```
 */
export function ManagerListSkeleton({
  rows = MANAGER_LIST_SKELETON_DEFAULT_ROWS,
  accessibilityLabel = 'Loading list',
  testID = 'manager-list-skeleton',
  style,
}: ManagerListSkeletonProps) {
  const palette = useColorPalette();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          width: '100%',
          borderWidth: 1,
          borderColor: palette.border,
          borderRadius: 4,
          overflow: 'hidden',
          backgroundColor: palette.surface,
        },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingVertical: SKELETON_ROW_PADDING_Y,
          paddingHorizontal: SKELETON_ROW_PADDING_X,
          backgroundColor: withAlpha(palette.tint, 0.12),
        },
      }),
    [palette.border, palette.surface, palette.tint]
  );

  const rowCount = Math.max(1, rows);

  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ busy: true }}
      style={[styles.root, style]}
    >
      <View style={styles.header} testID={`${testID}-header`}>
        <ManagerSkeletonBlock flex={1} testID={`${testID}-header-bar-0`} />
        <ManagerSkeletonBlock flex={2} testID={`${testID}-header-bar-1`} />
        <ManagerSkeletonBlock flex={1} testID={`${testID}-header-bar-2`} />
      </View>
      {Array.from({ length: rowCount }, (_, index) => (
        <ManagerSkeletonRow
          key={`skeleton-row-${index}`}
          testID={`${testID}-row-${index}`}
          columns={index % 2 === 0 ? [2, 3, 1] : [3, 2, 1]}
        />
      ))}
    </View>
  );
}
