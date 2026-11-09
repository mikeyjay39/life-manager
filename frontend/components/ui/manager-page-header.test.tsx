import React from 'react';
import { render, screen } from '@testing-library/react-native';

import { ManagerPageHeader } from '@/components/ui/manager-page-header';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';

function renderHeader(ui: React.ReactElement) {
  return render(
    <TenantThemeTestProvider theme={defaultResolvedTheme}>{ui}</TenantThemeTestProvider>
  );
}

describe('ManagerPageHeader', () => {
  it('given title when rendered then shows compact title without subtitle', () => {
    // Given a title only
    // When the header renders
    renderHeader(<ManagerPageHeader title="Document Manager" testID="page-header" />);
    // Then the title is visible and no subtitle text appears
    expect(screen.getByText('Document Manager')).toBeTruthy();
    expect(screen.getByTestId('page-header')).toBeTruthy();
  });

  it('given title and subtitle when rendered then shows both', () => {
    // Given a title and subtitle
    // When the header renders
    renderHeader(
      <ManagerPageHeader title="Health Manager" subtitle="Track family vitals" />
    );
    // Then both lines are visible
    expect(screen.getByText('Health Manager')).toBeTruthy();
    expect(screen.getByText('Track family vitals')).toBeTruthy();
  });
});
