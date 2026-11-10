import React from 'react';
import { Platform, Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { APP_MENU_BAR_STICKY_OFFSET } from '@/components/ui/manager-layout';
import { ManagerStickyFilterChrome } from '@/components/ui/manager-sticky-filter-chrome';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';

function renderChrome(ui: React.ReactElement) {
  return render(
    <TenantThemeTestProvider theme={defaultResolvedTheme}>{ui}</TenantThemeTestProvider>
  );
}

function flatStyle(node: { props: { style?: unknown } }) {
  const style = node.props.style;
  return Array.isArray(style) ? Object.assign({}, ...style.flat(Infinity)) : style;
}

describe('ManagerStickyFilterChrome', () => {
  it('given filter children when rendered then shows sticky chrome with content', () => {
    // Given / When
    renderChrome(
      <ManagerStickyFilterChrome>
        <Text>Search by title</Text>
      </ManagerStickyFilterChrome>
    );

    // Then
    expect(screen.getByTestId('manager-sticky-filter-chrome')).toBeTruthy();
    expect(screen.getByLabelText('Filter controls')).toBeTruthy();
    expect(screen.getByText('Search by title')).toBeTruthy();
  });

  it('given no filter children when rendered then omits empty sticky bar', () => {
    // Given / When
    renderChrome(<ManagerStickyFilterChrome>{null}</ManagerStickyFilterChrome>);

    // Then
    expect(screen.queryByTestId('manager-sticky-filter-chrome')).toBeNull();
    expect(screen.queryByLabelText('Filter controls')).toBeNull();
  });

  it('given empty fragment children when rendered then omits empty sticky bar', () => {
    // Given / When
    renderChrome(
      <ManagerStickyFilterChrome>
        {false}
        {null}
        {''}
      </ManagerStickyFilterChrome>
    );

    // Then
    expect(screen.queryByTestId('manager-sticky-filter-chrome')).toBeNull();
  });

  it('given web platform when rendered then sticks below AppMenuBar offset', () => {
    // Given
    const previousOs = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });

    try {
      // When
      renderChrome(
        <ManagerStickyFilterChrome testID="docs-filter">
          <Text>Title search</Text>
        </ManagerStickyFilterChrome>
      );

      // Then
      const chrome = screen.getByTestId('docs-filter');
      const style = flatStyle(chrome);
      expect(style.position).toBe('sticky');
      expect(style.top).toBe(APP_MENU_BAR_STICKY_OFFSET);
      expect(style.zIndex).toBe(5);
    } finally {
      Object.defineProperty(Platform, 'OS', {
        configurable: true,
        value: previousOs,
      });
    }
  });

  it('given custom accessibilityLabel when rendered then uses that label', () => {
    // Given / When
    renderChrome(
      <ManagerStickyFilterChrome accessibilityLabel="Document title search">
        <Text>Query</Text>
      </ManagerStickyFilterChrome>
    );

    // Then
    expect(screen.getByLabelText('Document title search')).toBeTruthy();
  });
});
