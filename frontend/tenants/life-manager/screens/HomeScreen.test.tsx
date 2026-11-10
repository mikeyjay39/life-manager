import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import {
  MANAGER_CONTENT_MAX_WIDTH,
  MANAGER_CONTENT_PADDING_X,
} from '@/components/ui/manager-layout';
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

vi.mock('@/components/ui/icon-symbol', () => ({
  IconSymbol: () => null,
}));

vi.mock('expo-router', () => ({
  router: {
    replace: vi.fn(),
  },
}));

const tenantDocumentsOnly: TenantModule = {
  ...lifeManagerTenantMeta,
  screens: {
    Home: HomeScreen,
    Documents: () => null,
  },
};

const tenantAllManagers: TenantModule = {
  ...lifeManagerTenantMeta,
  screens: {
    Home: HomeScreen,
    Documents: () => null,
    Health: () => null,
    Car: () => null,
  },
};

function renderHomeScreen(tenant: TenantModule = tenantDocumentsOnly) {
  return render(
    <TenantTestProvider tenant={tenant}>
      <TenantThemeTestProvider theme={defaultResolvedTheme}>
        <HomeScreen />
      </TenantThemeTestProvider>
    </TenantTestProvider>
  );
}

describe('HomeScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows Documents, Health, and Cars icons on the hub', () => {
    // Given a signed-in Home hub with Documents registered only
    // When Home renders
    renderHomeScreen(tenantDocumentsOnly);
    // Then manager icons for Documents, Health, and Cars are present
    expect(screen.getByLabelText('Documents')).toBeTruthy();
    expect(screen.getByLabelText('Health, Coming soon')).toBeTruthy();
    expect(screen.getByLabelText('Cars, Coming soon')).toBeTruthy();
    // And document create / list / Proton connect are not on Home
    expect(screen.queryByLabelText('Create document')).toBeNull();
    expect(screen.queryByLabelText('Refresh documents')).toBeNull();
    expect(screen.queryByLabelText('Connect Proton Drive')).toBeNull();
    expect(screen.queryByLabelText('Documents section')).toBeNull();
  });

  it('centers hub body with the shared manager content column', () => {
    // Given a signed-in Home hub
    // When Home renders
    renderHomeScreen(tenantDocumentsOnly);
    // Then body uses ManagerPageContent width rules
    const pageContent = screen.getByTestId('home-page-content');
    expect(pageContent.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          maxWidth: MANAGER_CONTENT_MAX_WIDTH,
          alignSelf: 'center',
          paddingHorizontal: MANAGER_CONTENT_PADDING_X,
          width: '100%',
        }),
      ])
    );
  });

  it('opens Document Manager when the Documents icon is pressed', () => {
    // Given the Home hub with Documents registered
    renderHomeScreen(tenantDocumentsOnly);
    // When the user presses Documents
    fireEvent.press(screen.getByLabelText('Documents'));
    // Then Document Manager route is opened
    expect(router.replace).toHaveBeenCalledWith('/(tabs)/documents');
  });

  it('does not navigate when Coming soon manager icons are pressed', () => {
    // Given Health and Cars are not registered
    renderHomeScreen(tenantDocumentsOnly);
    // When the user presses Coming soon tiles
    fireEvent.press(screen.getByLabelText('Health, Coming soon'));
    fireEvent.press(screen.getByLabelText('Cars, Coming soon'));
    // Then no navigation occurs
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('navigates to Health and Cars when those screens are registered', () => {
    // Given Health and Car screens are registered
    renderHomeScreen(tenantAllManagers);
    // When the user presses Health then Cars
    fireEvent.press(screen.getByLabelText('Health'));
    fireEvent.press(screen.getByLabelText('Cars'));
    // Then those manager routes open
    expect(router.replace).toHaveBeenCalledWith('/(tabs)/health');
    expect(router.replace).toHaveBeenCalledWith('/(tabs)/car');
  });
});
