import type { TextStyle, ViewStyle } from 'react-native';

import type { ColorPalette } from '@/lib/tenant/theme/types';
import { withAlpha } from '@/lib/tenant/theme/color-utils';

/** Left accent width for selected entity chips and context. */
export const MANAGER_SELECTION_ACCENT_WIDTH = 4;

/** Outer border width for selected entity chips. */
export const MANAGER_SELECTION_BORDER_WIDTH = 2;

/** Tint fill alpha for selected chip / context surfaces. */
export const MANAGER_SELECTION_FILL_ALPHA = 0.14;

export type ManagerPickerChipStyles = {
  chip: ViewStyle;
  chipSelected: ViewStyle;
  chipInactive: ViewStyle;
  chipText: TextStyle;
  chipTextSelected: TextStyle;
};

/**
 * Shared picker chip styles for HealthMember and Car entity selection.
 * Selected state uses tint border, left accent, and tinted surface — not a
 * solid fill — so it stays clear on quiet chrome and dense lists.
 */
export function createManagerPickerChipStyles(
  palette: ColorPalette
): ManagerPickerChipStyles {
  return {
    chip: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 12,
      backgroundColor: palette.background,
    },
    chipSelected: {
      borderWidth: MANAGER_SELECTION_BORDER_WIDTH,
      borderColor: palette.tint,
      borderLeftWidth: MANAGER_SELECTION_ACCENT_WIDTH,
      backgroundColor: withAlpha(palette.tint, MANAGER_SELECTION_FILL_ALPHA),
    },
    chipInactive: {
      opacity: 0.7,
      borderStyle: 'dashed',
    },
    chipText: {
      color: palette.text,
      fontSize: 15,
    },
    chipTextSelected: {
      color: palette.tint,
      fontWeight: '700',
    },
  };
}

export type ManagerSelectionSurfaceStyles = {
  selectedSurface: ViewStyle;
};

/** Soft selected surface for entity detail cards under a picker. */
export function createManagerSelectionSurfaceStyles(
  palette: ColorPalette
): ManagerSelectionSurfaceStyles {
  return {
    selectedSurface: {
      borderRadius: 8,
      borderWidth: 1,
      borderColor: palette.tint,
      borderLeftWidth: MANAGER_SELECTION_ACCENT_WIDTH,
      backgroundColor: withAlpha(palette.tint, MANAGER_SELECTION_FILL_ALPHA),
      paddingVertical: 8,
      paddingHorizontal: 12,
      gap: 8,
    },
  };
}
