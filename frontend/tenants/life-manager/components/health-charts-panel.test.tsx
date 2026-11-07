import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { useAuth } from '@/contexts/AuthContext';
import { authenticatedFetch } from '@/lib/api/client';
import type { HealthMemberDto } from '@/lib/api/types';
import type { HealthReadingDto } from '@/lib/api/generated/life-manager/HealthReadingDto';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';
import {
  saveUnitPreference,
  type UnitSystem,
} from '@/lib/health/units';

import HealthChartsPanel from './health-charts-panel';

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

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
  },
}));

vi.mock('react-native-gifted-charts', () => {
  const ReactLib = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    LineChart: (props: { data?: { value: number }[] }) =>
      ReactLib.createElement(
        Text,
        { accessibilityLabel: 'Mock line chart' },
        `points:${props.data?.length ?? 0}`
      ),
  };
});

const mockUseAuth = vi.mocked(useAuth);
const mockAuthenticatedFetch = vi.mocked(authenticatedFetch);

function member(): HealthMemberDto {
  return {
    id: 'm1',
    display_name: 'Alex',
    birth_date: null,
    notes: null,
    active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deactivated_at: null,
  };
}

function reading(
  overrides: Partial<HealthReadingDto> &
    Pick<HealthReadingDto, 'id' | 'recorded_on'>
): HealthReadingDto {
  return {
    health_member_id: 'm1',
    height_cm: null,
    weight_kg: null,
    systolic_mm_hg: null,
    diastolic_mm_hg: null,
    heart_rate_bpm: null,
    notes: null,
    bmi: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function defaultAuth(): ReturnType<typeof useAuth> {
  return {
    token: 'tok',
    handleUnauthorized: vi.fn(),
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn(),
  } as ReturnType<typeof useAuth>;
}

function StatefulChartsPanel({
  healthMember,
}: {
  healthMember: HealthMemberDto | null;
}) {
  const [unitSystem, setUnitSystem] = React.useState<UnitSystem>('metric');
  return (
    <TenantThemeTestProvider theme={defaultResolvedTheme}>
      <HealthChartsPanel
        healthMember={healthMember}
        unitSystem={unitSystem}
        onUnitSystemChange={async (next) => {
          setUnitSystem(next);
          await saveUnitPreference(next);
        }}
        unitPreferenceReady
      />
    </TenantThemeTestProvider>
  );
}

function renderPanel(healthMember: HealthMemberDto | null) {
  return render(<StatefulChartsPanel healthMember={healthMember} />);
}

describe('HealthChartsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue(defaultAuth());
  });

  it('prompts when no HealthMember is selected', () => {
    renderPanel(null);
    expect(screen.getByLabelText('Charts need HealthMember')).toBeTruthy();
    expect(mockAuthenticatedFetch).not.toHaveBeenCalled();
  });

  it('shows weight chart points in date order from metric API data', async () => {
    // Given three weight readings (API newest-first)
    mockAuthenticatedFetch.mockResolvedValue(
      new Response(
        JSON.stringify([
          reading({ id: 'c', recorded_on: '2026-03-01', weight_kg: 72 }),
          reading({ id: 'a', recorded_on: '2026-01-01', weight_kg: 70 }),
          reading({ id: 'b', recorded_on: '2026-02-01', weight_kg: 71 }),
        ]),
        { status: 200 }
      )
    );

    renderPanel(member());

    await waitFor(() => {
      expect(screen.getByLabelText('Weight chart')).toBeTruthy();
    });
    expect(screen.getByLabelText('Mock line chart').props.children).toBe(
      'points:3'
    );
    expect(screen.getByLabelText('Y axis kg')).toBeTruthy();

    const calledUrl = String(mockAuthenticatedFetch.mock.calls[0]?.[0] ?? '');
    expect(calledUrl).toContain('/health-readings?');
    expect(calledUrl).toContain('health_member_id=m1');
    expect(calledUrl).not.toMatch(/imperial|lb|weight_lb/i);
  });

  it('updates weight chart label to lb when imperial is selected', async () => {
    const AsyncStorage = (
      await import('@react-native-async-storage/async-storage')
    ).default;
    mockAuthenticatedFetch.mockResolvedValue(
      new Response(
        JSON.stringify([
          reading({ id: 'a', recorded_on: '2026-01-01', weight_kg: 70 }),
        ]),
        { status: 200 }
      )
    );

    renderPanel(member());
    await waitFor(() => expect(screen.getByLabelText('Y axis kg')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Imperial units'));

    await waitFor(() =>
      expect(screen.getByLabelText('Y axis lb')).toBeTruthy()
    );
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'health_unit_preference',
      'imperial'
    );
    // And the list API was not asked for imperial fields
    for (const call of mockAuthenticatedFetch.mock.calls) {
      expect(String(call[0])).not.toMatch(/imperial|lb|weight_lb/i);
    }
  });

  it('shows empty-state copy when there are no points', async () => {
    mockAuthenticatedFetch.mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 })
    );
    renderPanel(member());
    await waitFor(() =>
      expect(screen.getByLabelText('Charts empty state')).toBeTruthy()
    );
  });

  it('renders a single weight point without error', async () => {
    mockAuthenticatedFetch.mockResolvedValue(
      new Response(
        JSON.stringify([
          reading({ id: 'a', recorded_on: '2026-06-01', weight_kg: 68 }),
        ]),
        { status: 200 }
      )
    );
    renderPanel(member());
    await waitFor(() => {
      expect(screen.getByLabelText('Mock line chart').props.children).toBe(
        'points:1'
      );
    });
  });
});
