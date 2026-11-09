import React, { createContext, useContext, useMemo } from 'react';
import {
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import {
  MANAGER_DATA_CELL_GAP,
  MANAGER_DATA_ROW_GAP,
  MANAGER_DATA_ROW_PADDING_X,
  MANAGER_DATA_ROW_PADDING_Y,
  MANAGER_DATA_STACK_BELOW,
} from '@/components/ui/manager-layout';
import { useColorPalette } from '@/lib/tenant/TenantThemeContext';

export type ManagerDataListCell = {
  /** Stable key for React and tests. */
  key: string;
  /** Cell content (string or node). */
  content: React.ReactNode;
  /**
   * When true, use body text. When false/omitted, use muted meta typography.
   * Prefer primary for the main label column only.
   */
  primary?: boolean;
  /** Optional accessible name for long truncated values. */
  accessibilityLabel?: string;
  /** Flex grow for wide row layout. Default 1. */
  flex?: number;
};

export type ManagerDataListRowProps = {
  /** Leading column (usually a date). Renders as body text. */
  leading: React.ReactNode;
  /** Aligned fields after the leading column. */
  cells?: ManagerDataListCell[];
  /** Trailing row actions (edit/delete). Stay reachable on all widths. */
  actions?: React.ReactNode;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export type ManagerDataListProps = {
  children: React.ReactNode;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /**
   * Width at or below which cells stack under the leading column.
   * Default: MANAGER_DATA_STACK_BELOW.
   */
  stackBelowWidth?: number;
};

const ManagerDataListLayoutContext = createContext(false);

/**
 * Shared dense manager data list: hairline rows, aligned columns on wide
 * viewports, and a defined wrap/stack pattern on narrow native widths.
 *
 * ```
 * Panel -> ManagerDataList : history / results region
 * ManagerDataList -> ManagerDataListRow : dense row per item
 * alt wide viewport
 *   Row -> leading | cells | actions : one horizontal band
 * else narrow viewport
 *   Row -> leading
 *   Row -> cells (wrap)
 *   Row -> actions
 * end
 * ```
 */
export function ManagerDataList({
  children,
  accessibilityLabel,
  style,
  testID,
  stackBelowWidth = MANAGER_DATA_STACK_BELOW,
}: ManagerDataListProps) {
  const { width } = useWindowDimensions();
  const stacked = width <= stackBelowWidth;

  return (
    <ManagerDataListLayoutContext.Provider value={stacked}>
      <View
        style={[styles.list, style]}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
      >
        {children}
      </View>
    </ManagerDataListLayoutContext.Provider>
  );
}

/**
 * One dense history/table row. Prefer ManagerDataList as the parent so width
 * stacking stays consistent across managers.
 */
export function ManagerDataListRow({
  leading,
  cells = [],
  actions,
  accessibilityLabel,
  style,
  testID,
}: ManagerDataListRowProps) {
  const palette = useColorPalette();
  const stacked = useContext(ManagerDataListLayoutContext);

  const themed = useMemo(
    () => ({
      borderBottomColor: palette.border,
    }),
    [palette.border]
  );

  return (
    <View
      style={[
        styles.row,
        stacked ? styles.rowStacked : styles.rowWide,
        themed,
        style,
      ]}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <View
        style={stacked ? styles.leadingStacked : styles.leadingWide}
        testID={testID ? `${testID}-leading` : undefined}
      >
        {typeof leading === 'string' || typeof leading === 'number' ? (
          <ThemedText type="body" numberOfLines={1} ellipsizeMode="tail">
            {leading}
          </ThemedText>
        ) : (
          leading
        )}
      </View>

      {cells.length > 0 ? (
        <View
          style={stacked ? styles.cellsStacked : styles.cellsWide}
          testID={testID ? `${testID}-cells` : undefined}
        >
          {cells.map((cell) => (
            <View
              key={cell.key}
              style={[
                styles.cell,
                stacked ? styles.cellStacked : styles.cellWide,
                { flex: stacked ? undefined : (cell.flex ?? 1) },
              ]}
            >
              {typeof cell.content === 'string' || typeof cell.content === 'number' ? (
                <ThemedText
                  type={cell.primary ? 'body' : 'meta'}
                  numberOfLines={stacked ? 3 : 1}
                  ellipsizeMode="tail"
                  accessibilityLabel={cell.accessibilityLabel}
                >
                  {cell.content}
                </ThemedText>
              ) : (
                cell.content
              )}
            </View>
          ))}
        </View>
      ) : null}

      {actions ? (
        <View
          style={stacked ? styles.actionsStacked : styles.actionsWide}
          testID={testID ? `${testID}-actions` : undefined}
        >
          {actions}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    width: '100%',
    gap: MANAGER_DATA_ROW_GAP,
  },
  row: {
    width: '100%',
    paddingVertical: MANAGER_DATA_ROW_PADDING_Y,
    paddingHorizontal: MANAGER_DATA_ROW_PADDING_X,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: MANAGER_DATA_CELL_GAP,
  },
  rowWide: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
  },
  rowStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  leadingWide: {
    flexShrink: 0,
    minWidth: 96,
    maxWidth: 140,
  },
  leadingStacked: {
    width: '100%',
  },
  cellsWide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: MANAGER_DATA_CELL_GAP,
    minWidth: 0,
  },
  cellsStacked: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: MANAGER_DATA_CELL_GAP,
  },
  cell: {
    minWidth: 0,
  },
  cellWide: {
    flexShrink: 1,
  },
  cellStacked: {
    flexGrow: 1,
    flexBasis: '40%',
  },
  actionsWide: {
    flexShrink: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: MANAGER_DATA_CELL_GAP,
    marginLeft: 'auto',
  },
  actionsStacked: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: MANAGER_DATA_CELL_GAP,
  },
});
