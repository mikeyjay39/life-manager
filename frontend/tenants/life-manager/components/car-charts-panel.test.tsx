import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { useAuth } from '@/contexts/AuthContext';
import { authenticatedFetch } from '@/lib/api/client';
import type { CarDto } from '@/lib/api/types';
import type { CarMaintenanceEventDto } from '@/lib/api/generated/life-manager/CarMaintenanceEventDto';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';

import CarChartsPanel from './car-charts-panel';

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
    BarChart: (props: { data?: { value: number }[] }) =>
      ReactLib.createElement(
        Text,
        { accessibilityLabel: 'Mock bar chart' },
        `bars:${props.data?.length ?? 0}`
      ),
  };
});

const mockUseAuth = vi.mocked(useAuth);
const mockAuthenticatedFetch = vi.mocked(authenticatedFetch);

function car(): CarDto {
  return {
    id: 'c1',
    display_name: 'Daily Driver',
    make: 'Toyota',
    model: 'Corolla',
    year: 2018,
    vin: null,
    license_plate: null,
    notes: null,
    insurance_document_id: null,
    registration_document_id: null,
    active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deactivated_at: null,
  };
}

function event(
  overrides: Partial<CarMaintenanceEventDto> &
    Pick<CarMaintenanceEventDto, 'id' | 'occurred_on' | 'event_type'>
): CarMaintenanceEventDto {
  return {
    car_id: 'c1',
    odometer_miles: null,
    cost_cents: null,
    title: null,
    notes: null,
    document_id: null,
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

function renderPanel(
  selectedCar: CarDto | null,
  refreshKey = 0
) {
  return render(
    <TenantThemeTestProvider theme={defaultResolvedTheme}>
      <CarChartsPanel selectedCar={selectedCar} refreshKey={refreshKey} />
    </TenantThemeTestProvider>
  );
}

describe('CarChartsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue(defaultAuth());
  });

  it('prompts when no Car is selected', () => {
    renderPanel(null);
    expect(screen.getByLabelText('Charts need Car')).toBeTruthy();
    expect(mockAuthenticatedFetch).not.toHaveBeenCalled();
  });

  it('shows odometer chart points in date order', async () => {
    // Given three events with odometer_miles (API newest-first)
    mockAuthenticatedFetch.mockResolvedValue(
      new Response(
        JSON.stringify([
          event({
            id: 'c',
            occurred_on: '2026-03-01',
            event_type: 'service',
            odometer_miles: 52000,
          }),
          event({
            id: 'a',
            occurred_on: '2026-01-01',
            event_type: 'oil_change',
            odometer_miles: 50000,
          }),
          event({
            id: 'b',
            occurred_on: '2026-02-01',
            event_type: 'tire',
            odometer_miles: 51000,
          }),
        ]),
        { status: 200 }
      )
    );

    renderPanel(car());

    await waitFor(() => {
      expect(screen.getByLabelText('Odometer chart')).toBeTruthy();
    });
    expect(screen.getByLabelText('Mock line chart').props.children).toBe(
      'points:3'
    );
    expect(screen.getByLabelText('Y axis miles')).toBeTruthy();

    const calledUrl = String(mockAuthenticatedFetch.mock.calls[0]?.[0] ?? '');
    expect(calledUrl).toContain('/car-maintenance-events?');
    expect(calledUrl).toContain('car_id=c1');
    expect(calledUrl).toContain('from=');
    expect(calledUrl).toContain('to=');
  });

  it('shows cost chart from cost_cents as USD', async () => {
    mockAuthenticatedFetch.mockResolvedValue(
      new Response(
        JSON.stringify([
          event({
            id: 'a',
            occurred_on: '2026-01-01',
            event_type: 'oil_change',
            cost_cents: 5999,
          }),
          event({
            id: 'b',
            occurred_on: '2026-02-01',
            event_type: 'tire',
            cost_cents: 20000,
          }),
        ]),
        { status: 200 }
      )
    );

    renderPanel(car());
    await waitFor(() =>
      expect(screen.getByLabelText('Show Cost chart')).toBeTruthy()
    );
    fireEvent.press(screen.getByLabelText('Show Cost chart'));

    await waitFor(() => {
      expect(screen.getByLabelText('Cost chart')).toBeTruthy();
    });
    expect(screen.getByLabelText('Y axis USD')).toBeTruthy();
    expect(screen.getByLabelText('Mock line chart').props.children).toBe(
      'points:2'
    );
  });

  it('shows event type breakdown bars for mixed types', async () => {
    mockAuthenticatedFetch.mockResolvedValue(
      new Response(
        JSON.stringify([
          event({ id: 'a', occurred_on: '2026-01-01', event_type: 'oil_change' }),
          event({ id: 'b', occurred_on: '2026-02-01', event_type: 'tire' }),
          event({ id: 'c', occurred_on: '2026-03-01', event_type: 'oil_change' }),
        ]),
        { status: 200 }
      )
    );

    renderPanel(car());
    await waitFor(() =>
      expect(screen.getByLabelText('Show Event types chart')).toBeTruthy()
    );
    fireEvent.press(screen.getByLabelText('Show Event types chart'));

    await waitFor(() => {
      expect(screen.getByLabelText('Event type chart')).toBeTruthy();
    });
    expect(screen.getByLabelText('Mock bar chart').props.children).toBe(
      'bars:2'
    );
  });

  it('shows empty-state copy when there are no points', async () => {
    mockAuthenticatedFetch.mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 })
    );
    renderPanel(car());
    await waitFor(() =>
      expect(screen.getByLabelText('Charts empty state')).toBeTruthy()
    );
  });

  it('renders a single odometer point without error', async () => {
    mockAuthenticatedFetch.mockResolvedValue(
      new Response(
        JSON.stringify([
          event({
            id: 'a',
            occurred_on: '2026-06-01',
            event_type: 'service',
            odometer_miles: 12345,
          }),
        ]),
        { status: 200 }
      )
    );
    renderPanel(car());
    await waitFor(() => {
      expect(screen.getByLabelText('Mock line chart').props.children).toBe(
        'points:1'
      );
    });
  });

  it('shows miles since last oil change when data allows', async () => {
    mockAuthenticatedFetch.mockResolvedValue(
      new Response(
        JSON.stringify([
          event({
            id: 'a',
            occurred_on: '2026-01-01',
            event_type: 'oil_change',
            odometer_miles: 50000,
          }),
          event({
            id: 'b',
            occurred_on: '2026-06-01',
            event_type: 'service',
            odometer_miles: 53000,
          }),
        ]),
        { status: 200 }
      )
    );
    renderPanel(car());
    await waitFor(() => {
      expect(
        screen.getByLabelText('Miles since last oil change')
      ).toBeTruthy();
    });
    expect(
      screen.getByLabelText('Miles since last oil change').props.children
    ).toEqual(['Miles since last oil change: ', 3000]);
  });

  it('given refreshKey bump when mounted then reloads events', async () => {
    mockAuthenticatedFetch.mockResolvedValue(
      new Response(
        JSON.stringify([
          event({
            id: 'a',
            occurred_on: '2026-06-01',
            event_type: 'service',
            odometer_miles: 100,
          }),
        ]),
        { status: 200 }
      )
    );
    const { rerender } = render(
      <TenantThemeTestProvider theme={defaultResolvedTheme}>
        <CarChartsPanel selectedCar={car()} refreshKey={0} />
      </TenantThemeTestProvider>
    );

    await waitFor(() => {
      expect(mockAuthenticatedFetch).toHaveBeenCalledTimes(1);
    });

    rerender(
      <TenantThemeTestProvider theme={defaultResolvedTheme}>
        <CarChartsPanel selectedCar={car()} refreshKey={1} />
      </TenantThemeTestProvider>
    );

    await waitFor(() => {
      expect(mockAuthenticatedFetch).toHaveBeenCalledTimes(2);
    });
  });
});
