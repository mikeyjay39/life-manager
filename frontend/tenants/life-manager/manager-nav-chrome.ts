import type { TextStyle, ViewStyle } from 'react-native';

import type { ColorPalette } from '@/lib/tenant/theme/types';
import { withAlpha } from '@/lib/tenant/theme/color-utils';

/**
 * Shared menu / hub icon chrome for life-manager.
 * Hub and AppMenuBar use the same IconSymbol names from manager-registry.
 * Sizes differ by surface (compact menu vs hub launcher) but stay fixed tokens.
 */

/** Compact AppMenuBar icon size (Home, managers, Log Out). */
export const MANAGER_MENU_ICON_SIZE = 24;

/** Home hub launcher icon size (larger than menu, same glyph set). */
export const MANAGER_HUB_ICON_SIZE = 32;

/** AppMenuBar label size. */
export const MANAGER_MENU_LABEL_SIZE = 12;

/** Hub tile label size. */
export const MANAGER_HUB_LABEL_SIZE = 14;

/** Tint fill alpha for the active menu item (readable on light and dark). */
export const MANAGER_MENU_ACTIVE_FILL_ALPHA = 0.14;

/** Tint fill alpha for available hub tiles. */
export const MANAGER_HUB_AVAILABLE_FILL_ALPHA = 0.08;

/** Quiet fill alpha for Coming soon hub tiles. */
export const MANAGER_HUB_COMING_SOON_FILL_ALPHA = 0.04;

/** Border alpha for available hub tiles. */
export const MANAGER_HUB_AVAILABLE_BORDER_ALPHA = 0.35;

/** Quieter border alpha for Coming soon hub tiles. */
export const MANAGER_HUB_COMING_SOON_BORDER_ALPHA = 0.18;

/** Icon alpha for Coming soon hub tiles (muted vs available tint). */
export const MANAGER_HUB_COMING_SOON_ICON_ALPHA = 0.5;

/** Label alpha for Coming soon hub tiles. */
export const MANAGER_HUB_COMING_SOON_LABEL_ALPHA = 0.5;

export type ManagerMenuItemChrome = {
  item: ViewStyle;
  itemActive: ViewStyle;
  label: TextStyle;
  labelActive: TextStyle;
  iconColor: string;
  iconColorActive: string;
};

/**
 * Shared active menu treatment: tint icon/label, heavier weight, soft tint fill.
 * Inactive items use palette.icon so glyphs stay readable in light and dark.
 */
export function createManagerMenuItemChrome(
  palette: ColorPalette
): ManagerMenuItemChrome {
  return {
    item: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      gap: 4,
      backgroundColor: 'transparent',
    },
    itemActive: {
      backgroundColor: withAlpha(palette.tint, MANAGER_MENU_ACTIVE_FILL_ALPHA),
    },
    label: {
      fontSize: MANAGER_MENU_LABEL_SIZE,
      fontWeight: '500',
      color: palette.icon,
    },
    labelActive: {
      fontWeight: '700',
      color: palette.tint,
    },
    iconColor: palette.icon,
    iconColorActive: palette.tint,
  };
}

export type ManagerHubTileChrome = {
  tile: ViewStyle;
  label: TextStyle;
  status: TextStyle;
  iconColor: string;
};

/**
 * Hub tile chrome. Available tiles use tint; Coming soon stays quieter.
 */
export function createManagerHubTileChrome(
  palette: ColorPalette,
  isAvailable: boolean
): ManagerHubTileChrome {
  return {
    tile: {
      width: '30%',
      minWidth: 96,
      maxWidth: 140,
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 16,
      paddingHorizontal: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: withAlpha(
        palette.icon,
        isAvailable
          ? MANAGER_HUB_AVAILABLE_BORDER_ALPHA
          : MANAGER_HUB_COMING_SOON_BORDER_ALPHA
      ),
      backgroundColor: isAvailable
        ? withAlpha(palette.tint, MANAGER_HUB_AVAILABLE_FILL_ALPHA)
        : withAlpha(palette.icon, MANAGER_HUB_COMING_SOON_FILL_ALPHA),
      gap: 8,
    },
    label: {
      fontSize: MANAGER_HUB_LABEL_SIZE,
      fontWeight: isAvailable ? '600' : '500',
      color: isAvailable
        ? palette.text
        : withAlpha(palette.text, MANAGER_HUB_COMING_SOON_LABEL_ALPHA),
      textAlign: 'center',
    },
    status: {
      fontSize: 11,
      fontWeight: '500',
      color: withAlpha(palette.icon, 0.85),
      textAlign: 'center',
    },
    iconColor: isAvailable
      ? palette.tint
      : withAlpha(palette.icon, MANAGER_HUB_COMING_SOON_ICON_ALPHA),
  };
}
