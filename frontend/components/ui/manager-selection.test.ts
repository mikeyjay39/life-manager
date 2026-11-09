import { defaultColors } from '@/constants/theme';
import {
  MANAGER_SELECTION_ACCENT_WIDTH,
  MANAGER_SELECTION_BORDER_WIDTH,
  createManagerPickerChipStyles,
  createManagerSelectionSurfaceStyles,
} from '@/components/ui/manager-selection';
import { withAlpha } from '@/lib/tenant/theme/color-utils';

describe('createManagerPickerChipStyles', () => {
  it('given palette when created then selected chip uses tint accent not solid fill', () => {
    // Given
    const palette = defaultColors.light;
    // When
    const styles = createManagerPickerChipStyles(palette);
    // Then
    expect(styles.chipSelected).toMatchObject({
      borderWidth: MANAGER_SELECTION_BORDER_WIDTH,
      borderColor: palette.tint,
      borderLeftWidth: MANAGER_SELECTION_ACCENT_WIDTH,
      backgroundColor: withAlpha(palette.tint, 0.14),
    });
    expect(styles.chipSelected.backgroundColor).not.toBe(palette.tint);
    expect(styles.chipTextSelected).toMatchObject({
      color: palette.tint,
      fontWeight: '700',
    });
    expect(styles.chip.borderColor).toBe(palette.border);
  });
});

describe('createManagerSelectionSurfaceStyles', () => {
  it('given palette when created then surface uses tint left accent', () => {
    const palette = defaultColors.light;
    const styles = createManagerSelectionSurfaceStyles(palette);
    expect(styles.selectedSurface).toMatchObject({
      borderColor: palette.tint,
      borderLeftWidth: MANAGER_SELECTION_ACCENT_WIDTH,
      backgroundColor: withAlpha(palette.tint, 0.14),
    });
  });
});
