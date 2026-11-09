import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ManagerCta } from '@/components/ui/manager-cta';
import { MANAGER_SECTION_GAP } from '@/components/ui/manager-layout';
import { useColorPalette } from '@/lib/tenant/TenantThemeContext';

/** Collapsed browse, create entry, or edit reuse of the same form surface. */
export type ManagerFormMode = 'collapsed' | 'create' | 'edit';

export type ManagerFormVsResultsProps = {
  /** Row count in the results region. Drives empty state vs list. */
  itemCount: number;
  /** Primary Add control label (collapsed / empty). */
  addLabel: string;
  /** Short empty-state copy when there are no rows and the form is collapsed. */
  emptyMessage: string;
  /** Create/edit form fields and submit actions. Shown only when expanded. */
  form: React.ReactNode;
  /** Results / history region. Shown when itemCount > 0. */
  results?: React.ReactNode;
  /** Cancel control label when the form is open. Default "Cancel". */
  cancelLabel?: string;
  /** Controlled mode. Omit for uncontrolled expand/collapse. */
  mode?: ManagerFormMode;
  /** Uncontrolled initial mode. Default always `collapsed`. */
  defaultMode?: ManagerFormMode;
  /** Fires when mode changes (Add, Cancel, or parent-driven edit). */
  onModeChange?: (mode: ManagerFormMode) => void;
  /**
   * Fires when the user presses Cancel.
   * Return `false` to keep the form open (rare; validation normally stays open
   * because Cancel is not pressed).
   */
  onCancel?: () => boolean | void;
  /** Disables Add (for example no member/car selected). */
  addDisabled?: boolean;
  addAccessibilityLabel?: string;
  cancelAccessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Shared manager form-vs-results pattern: results stay the default focus,
 * create stays collapsed until Add, empty state offers one primary Add action,
 * and edit can reuse the same form surface.
 *
 * ```
 * [Activity]
 * User -> Pattern : load section
 * if itemCount > 0 and collapsed
 *   Pattern -> AddCta : show Add
 *   Pattern -> results : show list (default focus)
 * else if itemCount == 0 and collapsed
 *   Pattern -> emptyMessage
 *   Pattern -> AddCta : one primary Add
 * else create or edit
 *   Pattern -> form : expand surface
 *   Pattern -> CancelCta
 *   if itemCount > 0
 *     Pattern -> results
 * end
 * User -> AddCta : press
 * Pattern -> form : mode = create
 * User -> CancelCta : press
 * Pattern -> collapsed : list unchanged
 * note validation errors keep create/edit open until Cancel or success
 * ```
 */
export function ManagerFormVsResults({
  itemCount,
  addLabel,
  emptyMessage,
  form,
  results,
  cancelLabel = 'Cancel',
  mode: modeProp,
  defaultMode = 'collapsed',
  onModeChange,
  onCancel,
  addDisabled = false,
  addAccessibilityLabel,
  cancelAccessibilityLabel,
  style,
  testID,
}: ManagerFormVsResultsProps) {
  const palette = useColorPalette();
  const [uncontrolledMode, setUncontrolledMode] = useState<ManagerFormMode>(defaultMode);
  const isControlled = modeProp !== undefined;
  const mode = isControlled ? modeProp : uncontrolledMode;
  const isExpanded = mode === 'create' || mode === 'edit';
  const showEmpty = !isExpanded && itemCount === 0;
  const showResults = itemCount > 0;

  const setMode = useCallback(
    (next: ManagerFormMode) => {
      if (!isControlled) {
        setUncontrolledMode(next);
      }
      onModeChange?.(next);
    },
    [isControlled, onModeChange]
  );

  const handleAdd = useCallback(() => {
    setMode('create');
  }, [setMode]);

  const handleCancel = useCallback(() => {
    const allow = onCancel?.();
    if (allow === false) {
      return;
    }
    setMode('collapsed');
  }, [onCancel, setMode]);

  const emptyColor = useMemo(() => ({ color: palette.muted }), [palette.muted]);

  return (
    <View style={[styles.root, style]} testID={testID}>
      {isExpanded ? (
        <View
          style={styles.formRegion}
          accessibilityLabel="Manager form"
          testID={testID ? `${testID}-form` : undefined}
        >
          {form}
          <ManagerCta
            variant="outline"
            label={cancelLabel}
            onPress={handleCancel}
            accessibilityLabel={cancelAccessibilityLabel ?? cancelLabel}
            testID={testID ? `${testID}-cancel` : undefined}
          />
        </View>
      ) : showEmpty ? (
        <View
          style={styles.emptyRegion}
          accessibilityLabel="Manager empty state"
          testID={testID ? `${testID}-empty` : undefined}
        >
          <ThemedText style={emptyColor}>{emptyMessage}</ThemedText>
          <ManagerCta
            variant="primary"
            label={addLabel}
            onPress={handleAdd}
            disabled={addDisabled}
            accessibilityLabel={addAccessibilityLabel ?? addLabel}
            testID={testID ? `${testID}-add` : undefined}
          />
        </View>
      ) : (
        <ManagerCta
          variant="primary"
          label={addLabel}
          onPress={handleAdd}
          disabled={addDisabled}
          accessibilityLabel={addAccessibilityLabel ?? addLabel}
          testID={testID ? `${testID}-add` : undefined}
        />
      )}

      {showResults ? (
        <View
          style={styles.resultsRegion}
          accessibilityLabel="Manager results"
          testID={testID ? `${testID}-results` : undefined}
        >
          {results}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: MANAGER_SECTION_GAP,
  },
  formRegion: {
    width: '100%',
    gap: MANAGER_SECTION_GAP,
  },
  emptyRegion: {
    width: '100%',
    gap: MANAGER_SECTION_GAP,
  },
  resultsRegion: {
    width: '100%',
    gap: MANAGER_SECTION_GAP,
  },
});
