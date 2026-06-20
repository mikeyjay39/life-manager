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
});
