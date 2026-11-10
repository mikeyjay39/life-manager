import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';
import { ManagerHubTile } from '@/tenants/life-manager/components/manager-hub-tile';
import { MANAGER_HUB_ICON_SIZE } from '@/tenants/life-manager/manager-nav-chrome';
import type { ResolvedManagerTile } from '@/tenants/life-manager/manager-registry';

vi.mock('@/components/ui/icon-symbol', () => ({
  IconSymbol: ({
    name,
    size,
  }: {
    name: string;
    size: number;
  }) => <Text testID={`hub-icon-${name}`}>{String(size)}</Text>,
}));

const availableDocuments: ResolvedManagerTile = {
  id: 'documents',
  label: 'Documents',
  icon: 'doc.fill',
  status: 'available',
  route: '/(tabs)/documents',
};

const comingSoonHealth: ResolvedManagerTile = {
  id: 'health',
  label: 'Health',
  icon: 'heart.fill',
  status: 'coming_soon',
  disabledReason: 'Coming soon',
};

function renderTile(
  tile: ResolvedManagerTile,
  onPressAvailable: (route: string) => void = vi.fn()
) {
  return render(
    <TenantThemeTestProvider theme={defaultResolvedTheme}>
      <ManagerHubTile tile={tile} onPressAvailable={onPressAvailable} />
    </TenantThemeTestProvider>
  );
}

describe('ManagerHubTile', () => {
  it('uses the shared hub icon size and registry glyph for available tiles', () => {
    // Given an available Documents tile from the registry
    // When the tile renders
    renderTile(availableDocuments);
    // Then the shared hub icon size and Documents glyph are used
    const icon = screen.getByTestId('hub-icon-doc.fill');
    expect(icon.props.children).toBe(String(MANAGER_HUB_ICON_SIZE));
    expect(screen.getByLabelText('Documents')).toBeTruthy();
    expect(screen.getByText('Documents')).toBeTruthy();
  });

  it('keeps Coming soon tiles quieter and non-navigating', () => {
    // Given a Coming soon Health tile
    const onPressAvailable = vi.fn();
    renderTile(comingSoonHealth, onPressAvailable);
    // When the tile renders and is pressed
    expect(screen.getByLabelText('Health, Coming soon')).toBeTruthy();
    expect(screen.getByText('Coming soon')).toBeTruthy();
    const icon = screen.getByTestId('hub-icon-heart.fill');
    expect(icon.props.children).toBe(String(MANAGER_HUB_ICON_SIZE));
    fireEvent.press(screen.getByLabelText('Health, Coming soon'));
    // Then navigation does not run
    expect(onPressAvailable).not.toHaveBeenCalled();
  });

  it('navigates when an available tile is pressed', () => {
    // Given an available Documents tile
    const onPressAvailable = vi.fn();
    renderTile(availableDocuments, onPressAvailable);
    // When the user presses Documents
    fireEvent.press(screen.getByLabelText('Documents'));
    // Then the registry route is passed through
    expect(onPressAvailable).toHaveBeenCalledWith('/(tabs)/documents');
  });
});
