import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { router, usePathname } from 'expo-router';

import AppMenuBar from '@/components/app-menu-bar';
import { useAuth } from '@/contexts/AuthContext';
import { TenantTestProvider } from '@/lib/tenant/TenantContext';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';
import type { TenantModule } from '@/lib/tenant/types';
import { lifeManagerTenantMeta } from '@/tenants/life-manager/meta';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/components/ui/icon-symbol', () => ({
  IconSymbol: () => null,
}));

vi.mock('expo-router', () => ({
  router: {
    replace: vi.fn(),
  },
  usePathname: vi.fn(() => '/'),
}));

const mockUseAuth = vi.mocked(useAuth);
const mockUsePathname = vi.mocked(usePathname);

const tenantWithHealth: TenantModule = {
  ...lifeManagerTenantMeta,
  screens: {
    Home: () => null,
    Health: () => null,
  },
};

const tenantWithoutHealth: TenantModule = {
  ...lifeManagerTenantMeta,
  id: 'test-tenant',
  screens: {
    Home: () => null,
  },
};

function renderAppMenuBar(tenant: TenantModule = tenantWithHealth) {
  return render(
    <TenantTestProvider tenant={tenant}>
      <TenantThemeTestProvider theme={defaultResolvedTheme}>
        <AppMenuBar />
      </TenantThemeTestProvider>
    </TenantTestProvider>
  );
}

describe('AppMenuBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue('/');
    mockUseAuth.mockReturnValue({
      logout: vi.fn().mockResolvedValue(undefined),
      token: 'tok',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      signup: vi.fn(),
      handleUnauthorized: vi.fn(),
    });
  });

  it('renders Home, Health, and Log Out when the tenant has Health', () => {
    // Given a life-manager-style tenant with screens.Health
    // When the menu renders
    renderAppMenuBar(tenantWithHealth);
    // Then Home, Health, and Log Out are present
    expect(screen.getByLabelText('Home')).toBeTruthy();
    expect(screen.getByLabelText('Health')).toBeTruthy();
    expect(screen.getByLabelText('Log out')).toBeTruthy();
  });

  it('hides Health when the tenant has no Health screen', () => {
    // Given a tenant without screens.Health
    // When the menu renders
    renderAppMenuBar(tenantWithoutHealth);
    // Then Health is absent; Home and Log Out remain
    expect(screen.getByLabelText('Home')).toBeTruthy();
    expect(screen.queryByLabelText('Health')).toBeNull();
    expect(screen.getByLabelText('Log out')).toBeTruthy();
  });

  it('given Home when Health is pressed then navigates to Health route', () => {
    // Given signed-in user on Home
    mockUsePathname.mockReturnValue('/');
    renderAppMenuBar();
    // When Health is pressed
    fireEvent.press(screen.getByLabelText('Health'));
    // Then the Health Manager route is opened
    expect(router.replace).toHaveBeenCalledWith('/(tabs)/health');
  });

  it('given Health when Home is pressed then navigates to Home route', () => {
    // Given user on Health
    mockUsePathname.mockReturnValue('/health');
    renderAppMenuBar();
    // When Home is pressed
    fireEvent.press(screen.getByLabelText('Home'));
    // Then Documents Home route is opened
    expect(router.replace).toHaveBeenCalledWith('/(tabs)');
  });

  it('given Health screen when menu renders then Health shows as active', () => {
    // Given pathname is Health
    mockUsePathname.mockReturnValue('/health');
    // When the menu renders
    renderAppMenuBar();
    // Then Health is selected and Home is not
    expect(screen.getByLabelText('Health').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByLabelText('Home').props.accessibilityState).toMatchObject({
      selected: false,
    });
  });

  it('opens logout confirmation when Log Out is pressed', () => {
    renderAppMenuBar();
    fireEvent.press(screen.getByLabelText('Log out'));
    expect(screen.getByText('Are you sure you want to log out?')).toBeTruthy();
  });

  it('calls logout when logout is confirmed', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue({
      logout,
      token: 'tok',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      signup: vi.fn(),
      handleUnauthorized: vi.fn(),
    });

    renderAppMenuBar();
    fireEvent.press(screen.getByLabelText('Log out'));
    fireEvent.press(screen.getByLabelText('Log Out'));

    await waitFor(() => {
      expect(logout).toHaveBeenCalledTimes(1);
    });
  });
});
