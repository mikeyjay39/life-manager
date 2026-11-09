import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { ManagerScrollView } from '@/components/ui/manager-scroll-view';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';

vi.mock('@/components/app-menu-bar', () => ({
  default: () => <Text>App menu</Text>,
}));

function renderScroll(ui: React.ReactElement) {
  return render(
    <TenantThemeTestProvider theme={defaultResolvedTheme}>{ui}</TenantThemeTestProvider>
  );
}

describe('ManagerScrollView', () => {
  it('given manager page when rendered then shows menu and title without parallax header image', () => {
    // Given a quiet manager shell
    // When the shell renders
    renderScroll(
      <ManagerScrollView title="Car Manager" testID="manager-scroll">
        <Text>Body section</Text>
      </ManagerScrollView>
    );
    // Then menu and page title are visible under the menu
    expect(screen.getByText('App menu')).toBeTruthy();
    expect(screen.getByText('Car Manager')).toBeTruthy();
    expect(screen.getByText('Body section')).toBeTruthy();
    expect(screen.getByLabelText('Car Manager page')).toBeTruthy();
    // And no header image / parallax chrome is present
    expect(screen.queryByLabelText(/header image/i)).toBeNull();
  });

  it('given optional subtitle when rendered then shows subtitle under title', () => {
    // Given a subtitle
    renderScroll(
      <ManagerScrollView title="Documents" subtitle="Files and Proton">
        <Text>Body</Text>
      </ManagerScrollView>
    );
    // Then subtitle is visible
    expect(screen.getByText('Files and Proton')).toBeTruthy();
  });
});
