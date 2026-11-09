import { defaultColors } from '@/constants/theme';
import { withAlpha } from '@/lib/tenant/theme/color-utils';
import {
  MANAGER_HUB_AVAILABLE_FILL_ALPHA,
  MANAGER_HUB_COMING_SOON_FILL_ALPHA,
  MANAGER_HUB_ICON_SIZE,
  MANAGER_HUB_LABEL_SIZE,
  MANAGER_MENU_ACTIVE_FILL_ALPHA,
  MANAGER_MENU_ICON_SIZE,
  MANAGER_MENU_LABEL_SIZE,
  createManagerHubTileChrome,
  createManagerMenuItemChrome,
} from '@/tenants/life-manager/manager-nav-chrome';

describe('manager-nav-chrome sizes', () => {
  it('keeps menu and hub icon sizes as fixed shared tokens', () => {
    // Given the shared nav chrome tokens
    // When sizes are read
    // Then menu stays compact and hub stays larger on the same glyph set
    expect(MANAGER_MENU_ICON_SIZE).toBe(24);
    expect(MANAGER_HUB_ICON_SIZE).toBe(32);
    expect(MANAGER_HUB_ICON_SIZE).toBeGreaterThan(MANAGER_MENU_ICON_SIZE);
    expect(MANAGER_MENU_LABEL_SIZE).toBe(12);
    expect(MANAGER_HUB_LABEL_SIZE).toBe(14);
  });
});

describe('createManagerMenuItemChrome', () => {
  it.each([
    ['light', defaultColors.light],
    ['dark', defaultColors.dark],
  ] as const)(
    'given %s palette when created then active uses tint weight and soft fill',
    (_scheme, palette) => {
      // Given a scheme palette
      // When menu chrome is created
      const chrome = createManagerMenuItemChrome(palette);
      // Then active uses tint color, heavier weight, and soft tint fill
      expect(chrome.iconColor).toBe(palette.icon);
      expect(chrome.iconColorActive).toBe(palette.tint);
      expect(chrome.label.color).toBe(palette.icon);
      expect(chrome.labelActive).toMatchObject({
        color: palette.tint,
        fontWeight: '700',
      });
      expect(chrome.itemActive.backgroundColor).toBe(
        withAlpha(palette.tint, MANAGER_MENU_ACTIVE_FILL_ALPHA)
      );
      expect(chrome.itemActive.backgroundColor).not.toBe(palette.tint);
    }
  );
});

describe('createManagerHubTileChrome', () => {
  it.each([
    ['light', defaultColors.light],
    ['dark', defaultColors.dark],
  ] as const)(
    'given %s palette when available then icon uses tint and fill stays soft',
    (_scheme, palette) => {
      // Given an available tile
      // When hub chrome is created
      const chrome = createManagerHubTileChrome(palette, true);
      // Then the icon uses tint and stays readable (not solid fill)
      expect(chrome.iconColor).toBe(palette.tint);
      expect(chrome.label.color).toBe(palette.text);
      expect(chrome.tile.backgroundColor).toBe(
        withAlpha(palette.tint, MANAGER_HUB_AVAILABLE_FILL_ALPHA)
      );
    }
  );

  it.each([
    ['light', defaultColors.light],
    ['dark', defaultColors.dark],
  ] as const)(
    'given %s palette when Coming soon then tile is quieter than available',
    (_scheme, palette) => {
      // Given Coming soon vs available
      const available = createManagerHubTileChrome(palette, true);
      const comingSoon = createManagerHubTileChrome(palette, false);
      // When both resolve
      // Then Coming soon uses muted icon fill and quieter surface
      expect(comingSoon.iconColor).not.toBe(palette.tint);
      expect(comingSoon.tile.backgroundColor).toBe(
        withAlpha(palette.icon, MANAGER_HUB_COMING_SOON_FILL_ALPHA)
      );
      expect(comingSoon.label.fontWeight).toBe('500');
      expect(available.label.fontWeight).toBe('600');
      expect(comingSoon.label.color).not.toBe(palette.text);
    }
  );
});
