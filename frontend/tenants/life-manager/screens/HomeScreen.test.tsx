import React from 'react';
import { render, screen } from '@testing-library/react-native';

import { TenantTestProvider } from '@/lib/tenant/TenantContext';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';
import type { TenantModule } from '@/lib/tenant/types';
import { lifeManagerTenantMeta } from '@/tenants/life-manager/meta';
import HomeScreen from '@/tenants/life-manager/screens/HomeScreen';

vi.mock('@/components/parallax-scroll-view', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('expo-image', () => ({
  Image: () => null,
}));

vi.mock('@/components/hello-wave', () => ({
  HelloWave: () => null,
}));

const tenant: TenantModule = {
  ...lifeManagerTenantMeta,
  screens: {
    Home: HomeScreen,
  },
};

function renderHomeScreen() {
  return render(
    <TenantTestProvider tenant={tenant}>
      <TenantThemeTestProvider theme={defaultResolvedTheme}>
        <HomeScreen />
      </TenantThemeTestProvider>
    </TenantTestProvider>
  );
}

describe('HomeScreen', () => {
  it('shows tenant title and does not mount document create or list UI', () => {
    // Given a signed-in Home screen after Documents moved off Home
    // When Home renders
    renderHomeScreen();
    // Then the branded title is present
    expect(screen.getByText(/Life Manager/)).toBeTruthy();
    // And document create / list / Proton connect are not rendered
    expect(screen.queryByLabelText('Create document')).toBeNull();
    expect(screen.queryByLabelText('Refresh documents')).toBeNull();
    expect(screen.queryByLabelText('Connect Proton Drive')).toBeNull();
    expect(screen.queryByLabelText('Documents section')).toBeNull();
  });
});
