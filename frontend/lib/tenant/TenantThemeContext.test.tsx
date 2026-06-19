import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';

import { useColorPalette, TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';
import { mergeTenantTheme } from '@/lib/tenant/theme/merge-theme';

function PaletteProbe() {
  const palette = useColorPalette();
  return <Text testID="tint">{palette.tint}</Text>;
}

function ThemeColorProbe() {
  const textColor = useThemeColor({}, 'text');
  return <Text testID="text-color">{textColor}</Text>;
}

describe('TenantThemeContext', () => {
  it('exposes merged tint from tenant theme overrides', () => {
    const theme = mergeTenantTheme({ light: { tint: '#abcdef' } });
    const { getByTestId } = render(
      <TenantThemeTestProvider theme={theme}>
        <PaletteProbe />
      </TenantThemeTestProvider>
    );
    expect(getByTestId('tint').props.children).toBe('#abcdef');
  });

  it('useThemeColor returns tenant text color', () => {
    const theme = mergeTenantTheme({ light: { text: '#010101' } });
    const { getByTestId } = render(
      <TenantThemeTestProvider theme={theme}>
        <ThemeColorProbe />
      </TenantThemeTestProvider>
    );
    expect(getByTestId('text-color').props.children).toBe('#010101');
  });

  it('falls back to defaults when no tenant overrides', () => {
    const { getByTestId } = render(
      <TenantThemeTestProvider theme={defaultResolvedTheme}>
        <PaletteProbe />
      </TenantThemeTestProvider>
    );
    expect(getByTestId('tint').props.children).toBe(defaultResolvedTheme.colors.light.tint);
  });
});
