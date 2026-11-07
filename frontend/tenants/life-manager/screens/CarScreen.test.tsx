import React from 'react';
import { render, screen } from '@testing-library/react-native';

import { TenantTestProvider } from '@/lib/tenant/TenantContext';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';
import type { TenantModule } from '@/lib/tenant/types';
import { lifeManagerTenantMeta } from '@/tenants/life-manager/meta';
import CarScreen from '@/tenants/life-manager/screens/CarScreen';

vi.mock('@/components/parallax-scroll-view', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('expo-image', () => ({
  Image: () => null,
}));

const tenant: TenantModule = {
  ...lifeManagerTenantMeta,
  screens: {
    Home: () => null,
    Car: CarScreen,
  },
};

function renderCarScreen() {
  return render(
    <TenantTestProvider tenant={tenant}>
      <TenantThemeTestProvider theme={defaultResolvedTheme}>
        <CarScreen />
      </TenantThemeTestProvider>
    </TenantTestProvider>
  );
}

describe('CarScreen', () => {
  it('shows Car Manager with empty cars, maintenance, and charts sections', () => {
    // Given the Car Manager screen
    // When the screen renders
    renderCarScreen();
    // Then title and empty section placeholders are visible
    expect(screen.getByText('Car Manager')).toBeTruthy();
    expect(screen.getByLabelText('Cars section')).toBeTruthy();
    expect(screen.getByLabelText('Cars empty state')).toBeTruthy();
    expect(screen.getByLabelText('Maintenance section')).toBeTruthy();
    expect(screen.getByLabelText('Maintenance empty state')).toBeTruthy();
    expect(screen.getByLabelText('Charts section')).toBeTruthy();
    expect(screen.getByLabelText('Charts empty state')).toBeTruthy();
    // And Documents create/list UI is not present
    expect(screen.queryByText('Documents')).toBeNull();
    expect(screen.queryByText(/Create document/i)).toBeNull();
  });
});
