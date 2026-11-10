import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { useAuth } from '@/contexts/AuthContext';
import { authenticatedFetch } from '@/lib/api/client';
import { TenantTestProvider } from '@/lib/tenant/TenantContext';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';
import type { TenantModule } from '@/lib/tenant/types';
import { lifeManagerTenantMeta } from '@/tenants/life-manager/meta';
import HealthScreen from '@/tenants/life-manager/screens/HealthScreen';

vi.mock('@react-native-community/datetimepicker', async () => {
  const ReactLib = await import('react');
  const { View, Pressable, Text } = await import('react-native');
  return {
    __esModule: true,
    default: ({
      onChange,
    }: {
      onChange: (event: { type: string }, date?: Date) => void;
    }) =>
      ReactLib.createElement(
        View,
        null,
        ReactLib.createElement(
          Pressable,
          {
            accessibilityLabel: 'Confirm picked date',
            onPress: () => onChange({ type: 'set' }, new Date(2024, 5, 1)),
          },
          ReactLib.createElement(Text, null, 'Confirm')
        )
      ),
  };
});

vi.mock('@/components/ui/manager-scroll-view', () => ({
  ManagerScrollView: ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => (
    <>
      <Text>{title}</Text>
      {children}
    </>
  ),
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

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
  },
}));

vi.mock('react-native-gifted-charts', () => ({
  LineChart: () => null,
}));

const mockUseAuth = vi.mocked(useAuth);
const mockAuthenticatedFetch = vi.mocked(authenticatedFetch);

const tenant: TenantModule = {
  ...lifeManagerTenantMeta,
  screens: {
    Home: () => null,
    Health: HealthScreen,
  },
};

function renderHealthScreen() {
  return render(
    <TenantTestProvider tenant={tenant}>
      <TenantThemeTestProvider theme={defaultResolvedTheme}>
        <HealthScreen />
      </TenantThemeTestProvider>
    </TenantTestProvider>
  );
}

describe('HealthScreen', () => {
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
    mockAuthenticatedFetch.mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 })
    );
  });

  it('shows Health Manager with shared section chrome and collapsed create forms', () => {
    // Given the Health Manager screen
    // When the screen renders
    renderHealthScreen();
    // Then title and shared section chrome are visible
    expect(screen.getByText('Health Manager')).toBeTruthy();
    expect(screen.getByLabelText('HealthMembers section')).toBeTruthy();
    expect(screen.getByText('HealthMembers')).toBeTruthy();
    expect(screen.getByLabelText('Create HealthMember')).toBeTruthy();
    expect(screen.getByLabelText('Vitals section')).toBeTruthy();
    expect(screen.getByText('Vitals')).toBeTruthy();
    expect(screen.getByLabelText('Health readings panel')).toBeTruthy();
    // And vitals create stays collapsed until Add reading
    expect(screen.getByLabelText('Add reading')).toBeTruthy();
    expect(screen.queryByLabelText('Health reading form')).toBeNull();
    expect(screen.getByLabelText('Charts section')).toBeTruthy();
    expect(screen.getByText('Charts')).toBeTruthy();
    expect(
      screen.getByLabelText(
        'No HealthMember selected. Choose a HealthMember above to view charts.'
      )
    ).toBeTruthy();
    expect(screen.getByLabelText('Doctor visits section')).toBeTruthy();
    expect(screen.getByText('Doctor visits')).toBeTruthy();
    expect(screen.getByLabelText('Doctor visits panel')).toBeTruthy();
    expect(screen.getByLabelText('Add visit')).toBeTruthy();
    expect(screen.queryByLabelText('Doctor visit form')).toBeNull();
    // And Documents create/list UI is not present
    expect(screen.queryByText('Documents')).toBeNull();
    expect(screen.queryByText(/Create document/i)).toBeNull();
  });
});
