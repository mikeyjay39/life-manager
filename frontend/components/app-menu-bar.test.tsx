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

const tenantWithOptionalScreens: TenantModule = {
  ...lifeManagerTenantMeta,
  screens: {
    Home: () => null,
    Documents: () => null,
    Health: () => null,
    Car: () => null,
  },
};

const tenantWithoutOptionalScreens: TenantModule = {
  ...lifeManagerTenantMeta,
  id: 'test-tenant',
  screens: {
    Home: () => null,
  },
};

function renderAppMenuBar(tenant: TenantModule = tenantWithOptionalScreens) {
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

  it('renders Home, Documents, Health, Cars, and Log Out when optional screens are set', () => {
    // Given a life-manager-style tenant with Documents, Health, and Car
    // When the menu renders
    renderAppMenuBar(tenantWithOptionalScreens);
    // Then Home, Documents, Health, Cars, and Log Out are present
    expect(screen.getByLabelText('Home')).toBeTruthy();
    expect(screen.getByLabelText('Documents')).toBeTruthy();
    expect(screen.getByLabelText('Health')).toBeTruthy();
    expect(screen.getByLabelText('Cars')).toBeTruthy();
    expect(screen.getByLabelText('Log out')).toBeTruthy();
  });

  it('hides Documents, Health, and Cars when the tenant has no optional screens', () => {
    // Given a tenant without optional screens
    // When the menu renders
    renderAppMenuBar(tenantWithoutOptionalScreens);
    // Then optional items are absent; Home and Log Out remain
    expect(screen.getByLabelText('Home')).toBeTruthy();
    expect(screen.queryByLabelText('Documents')).toBeNull();
    expect(screen.queryByLabelText('Health')).toBeNull();
    expect(screen.queryByLabelText('Cars')).toBeNull();
    expect(screen.getByLabelText('Log out')).toBeTruthy();
  });

  it('given Home when Documents is pressed then navigates to Documents route', () => {
    // Given signed-in user on Home
    mockUsePathname.mockReturnValue('/');
    renderAppMenuBar();
    // When Documents is pressed
    fireEvent.press(screen.getByLabelText('Documents'));
    // Then the Document Manager route is opened
    expect(router.replace).toHaveBeenCalledWith('/(tabs)/documents');
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

  it('given Home when Cars is pressed then navigates to Car route', () => {
    // Given signed-in user on Home
    mockUsePathname.mockReturnValue('/');
    renderAppMenuBar();
    // When Cars is pressed
    fireEvent.press(screen.getByLabelText('Cars'));
    // Then the Car Manager route is opened
    expect(router.replace).toHaveBeenCalledWith('/(tabs)/car');
  });

  it('given Documents when Home is pressed then navigates to Home route', () => {
    // Given user on Documents
    mockUsePathname.mockReturnValue('/documents');
    renderAppMenuBar();
    // When Home is pressed
    fireEvent.press(screen.getByLabelText('Home'));
    // Then Home route is opened
    expect(router.replace).toHaveBeenCalledWith('/(tabs)');
  });

  it('given Home hub when menu renders then Home shows as active', () => {
    // Given pathname is Home
    mockUsePathname.mockReturnValue('/');
    // When the menu renders
    renderAppMenuBar();
    // Then Home is selected and Documents is not
    expect(screen.getByLabelText('Home').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByLabelText('Documents').props.accessibilityState).toMatchObject({
      selected: false,
    });
  });

  it('given Documents screen when menu renders then Documents shows as active', () => {
    // Given pathname is Documents
    mockUsePathname.mockReturnValue('/documents');
    // When the menu renders
    renderAppMenuBar();
    // Then Documents is selected and Home is not
    expect(screen.getByLabelText('Documents').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByLabelText('Home').props.accessibilityState).toMatchObject({
      selected: false,
    });
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

  it('given Car screen when menu renders then Cars shows as active', () => {
    // Given pathname is Car
    mockUsePathname.mockReturnValue('/car');
    // When the menu renders
    renderAppMenuBar();
    // Then Cars is selected and Home is not
    expect(screen.getByLabelText('Cars').props.accessibilityState).toMatchObject({
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
