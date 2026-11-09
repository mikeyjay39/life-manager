import { mergeTenantTheme } from '@/lib/tenant/theme/merge-theme';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';

describe('mergeTenantTheme', () => {
  it('returns full defaults when tenant theme is undefined', () => {
    expect(mergeTenantTheme(undefined)).toEqual(defaultResolvedTheme);
  });

  it('merges partial light color overrides', () => {
    const merged = mergeTenantTheme({
      light: { tint: '#ff0000' },
    });
    expect(merged.colors.light.tint).toBe('#ff0000');
    expect(merged.colors.light.background).toBe(defaultResolvedTheme.colors.light.background);
    expect(merged.colors.dark.tint).toBe(defaultResolvedTheme.colors.dark.tint);
  });

  it('merges copy fields independently', () => {
    const merged = mergeTenantTheme({
      copy: { loginSubtitle: 'Welcome back' },
    });
    expect(merged.copy.loginSubtitle).toBe('Welcome back');
    expect(merged.copy.homeTitleSuffix).toBe(defaultResolvedTheme.copy.homeTitleSuffix);
  });

  it('uses tenant header background when provided', () => {
    const merged = mergeTenantTheme({
      headerBackground: { light: '#111111', dark: '#222222' },
    });
    expect(merged.headerBackground).toEqual({ light: '#111111', dark: '#222222' });
  });

  it('falls back to default assets when not overridden', () => {
    const merged = mergeTenantTheme({});
    expect(merged.assets.logo).toBe(defaultResolvedTheme.assets.logo);
    expect(merged.assets.headerImage).toBe(defaultResolvedTheme.assets.headerImage);
  });

  it('includes default onTint for light and dark palettes', () => {
    const merged = mergeTenantTheme(undefined);
    expect(merged.colors.light.onTint).toBe('#fff');
    expect(merged.colors.dark.onTint).toBe('#151718');
  });

  it('merges partial dark onTint override', () => {
    const merged = mergeTenantTheme({
      dark: { onTint: '#000000' },
    });
    expect(merged.colors.dark.onTint).toBe('#000000');
    expect(merged.colors.dark.tint).toBe(defaultResolvedTheme.colors.dark.tint);
  });

  it('given default merge when reading palette then semantic tokens resolve for light and dark', () => {
    const merged = mergeTenantTheme(undefined);
    const semanticKeys = [
      'surface',
      'border',
      'muted',
      'success',
      'warning',
      'danger',
    ] as const;

    for (const key of semanticKeys) {
      expect(merged.colors.light[key]).toEqual(expect.any(String));
      expect(merged.colors.light[key].length).toBeGreaterThan(0);
      expect(merged.colors.dark[key]).toEqual(expect.any(String));
      expect(merged.colors.dark[key].length).toBeGreaterThan(0);
    }
  });

  it('given partial tenant override when merging then unspecified semantic tokens stay at defaults', () => {
    const merged = mergeTenantTheme({
      light: { danger: '#aa0000' },
    });
    expect(merged.colors.light.danger).toBe('#aa0000');
    expect(merged.colors.light.surface).toBe(defaultResolvedTheme.colors.light.surface);
    expect(merged.colors.light.border).toBe(defaultResolvedTheme.colors.light.border);
    expect(merged.colors.light.muted).toBe(defaultResolvedTheme.colors.light.muted);
    expect(merged.colors.light.success).toBe(defaultResolvedTheme.colors.light.success);
    expect(merged.colors.light.warning).toBe(defaultResolvedTheme.colors.light.warning);
    expect(merged.colors.light.tint).toBe(defaultResolvedTheme.colors.light.tint);
    expect(merged.colors.dark.danger).toBe(defaultResolvedTheme.colors.dark.danger);
  });
});
