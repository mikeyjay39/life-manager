import { mergeTenantTheme } from '@/lib/tenant/theme/merge-theme';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';
import {
  LIFE_MANAGER_BRAND_SKY,
  LIFE_MANAGER_BRAND_TINT_DARK,
  LIFE_MANAGER_BRAND_TINT_LIGHT,
  lifeManagerTenantMeta,
} from '@/tenants/life-manager/meta';

const DEFAULT_TEAL_TINT = '#0a7ea4';

function relativeLuminance(hex: string): number {
  let normalized = hex.replace(/^#/, '');
  if (normalized.length === 3) {
    normalized = normalized
      .split('')
      .map((digit) => digit + digit)
      .join('');
  }
  const channels = [0, 2, 4].map((offset) => {
    const channel = parseInt(normalized.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, background: string): number {
  const luminances = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (a, b) => b - a
  );
  return (luminances[0] + 0.05) / (luminances[1] + 0.05);
}

describe('life-manager brand theme', () => {
  it('given life-manager meta when theme merges then tint is logo sky family not default teal', () => {
    // Given
    const theme = lifeManagerTenantMeta.theme;

    // When
    const merged = mergeTenantTheme(theme);

    // Then
    expect(merged.colors.light.tint).toBe(LIFE_MANAGER_BRAND_TINT_LIGHT);
    expect(merged.colors.light.tabIconSelected).toBe(LIFE_MANAGER_BRAND_TINT_LIGHT);
    expect(merged.colors.light.tint).not.toBe(DEFAULT_TEAL_TINT);
    expect(merged.headerBackground.light).toBe(LIFE_MANAGER_BRAND_SKY);
    expect(merged.colors.dark.tint).toBe(LIFE_MANAGER_BRAND_TINT_DARK);
    expect(merged.colors.dark.tabIconSelected).toBe(LIFE_MANAGER_BRAND_TINT_DARK);
    expect(merged.colors.dark.tint).not.toBe(DEFAULT_TEAL_TINT);
  });

  it('given tenant without tint overrides when theme merges then tint stays app default', () => {
    // Given / When
    const merged = mergeTenantTheme({
      headerBackground: { light: '#A1CEDC', dark: '#1D3D47' },
    });

    // Then
    expect(merged.colors.light.tint).toBe(defaultResolvedTheme.colors.light.tint);
    expect(merged.colors.light.tint).toBe(DEFAULT_TEAL_TINT);
    expect(merged.colors.dark.tint).toBe(defaultResolvedTheme.colors.dark.tint);
  });

  it('given life-manager light mode when primary onTint resolves then label contrast stays readable', () => {
    // Given
    const merged = mergeTenantTheme(lifeManagerTenantMeta.theme);

    // When
    const onTint = merged.colors.light.onTint;
    const tint = merged.colors.light.tint;

    // Then — WCAG AA normal text needs 4.5:1 (default onTint is white)
    expect(onTint).toBe(defaultResolvedTheme.colors.light.onTint);
    expect(contrastRatio(onTint, tint)).toBeGreaterThanOrEqual(4.5);
  });

  it('given life-manager light tint when used as foreground on white then contrast stays readable', () => {
    // Given / When
    const merged = mergeTenantTheme(lifeManagerTenantMeta.theme);

    // Then — tint also colors links and selected icons on light backgrounds
    expect(contrastRatio(merged.colors.light.tint, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });
});
