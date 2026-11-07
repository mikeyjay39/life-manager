import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';

import { useAuth } from '@/contexts/AuthContext';
import { authenticatedFetch } from '@/lib/api/client';
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

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>();
  return {
    ...actual,
    authenticatedFetch: vi.fn(),
  };
});

vi.mock('expo-blur', () => ({
  BlurView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockUseAuth = vi.mocked(useAuth);
const mockAuthenticatedFetch = vi.mocked(authenticatedFetch);

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
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      token: 'tok',
      handleUnauthorized: vi.fn(),
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn(),
    } as ReturnType<typeof useAuth>);
    mockAuthenticatedFetch.mockImplementation(async (path: string) => {
      if (typeof path === 'string' && path.startsWith('/cars')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (typeof path === 'string' && path.startsWith('/documents')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });
  });

  it('shows Car Manager with Cars panel and empty maintenance/charts sections', async () => {
    // Given the Car Manager screen
    // When the screen renders
    renderCarScreen();
    // Then title and section shells are visible
    expect(screen.getByText('Car Manager')).toBeTruthy();
    expect(screen.getByLabelText('Cars section')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByLabelText('Create Car')).toBeTruthy();
    });
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
