import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { useAuth } from '@/contexts/AuthContext';
import { authenticatedFetch } from '@/lib/api/client';
import type { CarDto } from '@/lib/api/types';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';

import CarMaintenancePanel from './car-maintenance-panel';

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

vi.mock('expo-blur', () => ({
  BlurView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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

const mockUseAuth = vi.mocked(useAuth);
const mockAuthenticatedFetch = vi.mocked(authenticatedFetch);

const activeCar: CarDto = {
  id: 'c1',
  display_name: 'Daily',
  make: 'Toyota',
  model: 'Corolla',
  year: 2018,
  vin: null,
  license_plate: null,
  notes: null,
  insurance_document_id: null,
  registration_document_id: null,
  active: true,
  created_at: 't',
  updated_at: 't',
  deactivated_at: null,
};

const inactiveCar: CarDto = {
  ...activeCar,
  id: 'c2',
  display_name: 'Old van',
  active: false,
  deactivated_at: '2026-01-01T00:00:00Z',
};

function renderPanel(car: CarDto | null = activeCar) {
  return render(
    <TenantThemeTestProvider theme={defaultResolvedTheme}>
      <CarMaintenancePanel selectedCar={car} />
    </TenantThemeTestProvider>
  );
}

function mockDefaultLoads(events: unknown[] = [], docs: unknown[] = []) {
  mockAuthenticatedFetch.mockImplementation(async (path: string) => {
    if (typeof path === 'string' && path.startsWith('/car-maintenance-events')) {
      return new Response(JSON.stringify(events), { status: 200 });
    }
    if (typeof path === 'string' && path.startsWith('/documents')) {
      return new Response(JSON.stringify(docs), { status: 200 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  });
}

describe('CarMaintenancePanel', () => {
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
    mockDefaultLoads();
  });

  it('given no Car when render then prompts to select and disables add', async () => {
    // Given no selected Car
    renderPanel(null);
    // Then the panel asks the user to select or create
    expect(
      screen.getByLabelText('Maintenance select car prompt')
    ).toBeTruthy();
    expect(screen.getByLabelText('Add maintenance event')).toBeDisabled();
    await waitFor(() => {
      expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
        '/documents',
        expect.objectContaining({ method: 'GET' })
      );
    });
    expect(
      mockAuthenticatedFetch.mock.calls.some(
        ([path]) =>
          typeof path === 'string' && path.startsWith('/car-maintenance-events')
      )
    ).toBe(false);
  });

  it('given active Car when submit oil change with cost then posts and shows cost', async () => {
    // Given list then create then refresh
    mockAuthenticatedFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (typeof path === 'string' && path.startsWith('/documents')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (
        typeof path === 'string' &&
        path.startsWith('/car-maintenance-events') &&
        (!init?.method || init.method === 'GET')
      ) {
        const alreadyCreated = mockAuthenticatedFetch.mock.calls.some(
          ([p, i]) =>
            p === '/car-maintenance-events' &&
            (i as RequestInit | undefined)?.method === 'POST'
        );
        if (alreadyCreated) {
          return new Response(
            JSON.stringify([
              {
                id: 'e1',
                car_id: 'c1',
                occurred_on: '2026-01-15',
                event_type: 'oil_change',
                odometer_miles: 50000,
                cost_cents: 5999,
                title: null,
                notes: null,
                document_id: null,
                created_at: 't',
                updated_at: 't',
              },
            ]),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (path === '/car-maintenance-events' && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            id: 'e1',
            car_id: 'c1',
            occurred_on: '2026-01-15',
            event_type: 'oil_change',
            odometer_miles: 50000,
            cost_cents: 5999,
            title: null,
            notes: null,
            document_id: null,
            created_at: 't',
            updated_at: 't',
          }),
          { status: 201 }
        );
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    renderPanel();

    await waitFor(() => {
      expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
        '/car-maintenance-events?car_id=c1',
        expect.objectContaining({ method: 'GET' })
      );
    });

    fireEvent.changeText(
      screen.getByLabelText('Maintenance odometer miles'),
      '50000'
    );
    fireEvent.changeText(
      screen.getByLabelText('Maintenance cost in dollars'),
      '59.99'
    );
    fireEvent.press(screen.getByLabelText('Add maintenance event'));

    await waitFor(() => {
      expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
        '/car-maintenance-events',
        expect.objectContaining({ method: 'POST' })
      );
    });

    const postCall = mockAuthenticatedFetch.mock.calls.find(
      ([path, init]) =>
        path === '/car-maintenance-events' &&
        (init as RequestInit | undefined)?.method === 'POST'
    );
    expect(postCall).toBeTruthy();
    const body = JSON.parse(String((postCall![1] as RequestInit).body));
    expect(body.car_id).toBe('c1');
    expect(body.event_type).toBe('oil_change');
    expect(body.odometer_miles).toBe(50000);
    expect(body.cost_cents).toBe(5999);

    await waitFor(() => {
      expect(screen.getByLabelText('Cost $59.99')).toBeTruthy();
    });
  });

  it('given listed event when edit notes then delete after confirm', async () => {
    // Given one event in the list
    const listed = {
      id: 'e1',
      car_id: 'c1',
      occurred_on: '2026-01-15',
      event_type: 'service',
      odometer_miles: null,
      cost_cents: null,
      title: null,
      notes: 'old',
      document_id: null,
      created_at: 't',
      updated_at: 't',
    };
    mockAuthenticatedFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (typeof path === 'string' && path.startsWith('/documents')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (path === '/car-maintenance-events/e1' && init?.method === 'PUT') {
        return new Response(
          JSON.stringify({ ...listed, notes: 'updated' }),
          { status: 200 }
        );
      }
      if (path === '/car-maintenance-events/e1' && init?.method === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      if (
        typeof path === 'string' &&
        path.startsWith('/car-maintenance-events') &&
        (!init?.method || init.method === 'GET')
      ) {
        const deleted = mockAuthenticatedFetch.mock.calls.some(
          ([p, i]) =>
            p === '/car-maintenance-events/e1' &&
            (i as RequestInit | undefined)?.method === 'DELETE'
        );
        const updated = mockAuthenticatedFetch.mock.calls.some(
          ([p, i]) =>
            p === '/car-maintenance-events/e1' &&
            (i as RequestInit | undefined)?.method === 'PUT'
        );
        if (deleted) {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        if (updated) {
          return new Response(
            JSON.stringify([{ ...listed, notes: 'updated' }]),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify([listed]), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText(/Notes: old/i)).toBeTruthy();
    });

    fireEvent.press(screen.getByLabelText('Edit maintenance event on 2026-01-15'));
    fireEvent.changeText(
      screen.getByLabelText('Maintenance notes'),
      'updated'
    );
    fireEvent.press(screen.getByLabelText('Save maintenance event'));

    await waitFor(() => {
      expect(screen.getByText(/Notes: updated/i)).toBeTruthy();
    });

    fireEvent.press(screen.getByLabelText('Delete maintenance event on 2026-01-15'));
    fireEvent.press(screen.getByText('Delete'));

    await waitFor(() => {
      expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
        '/car-maintenance-events/e1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Maintenance history empty')).toBeTruthy();
    });
  });

  it('given inactive Car when render then create is disabled and history can load', async () => {
    // Given an inactive Car with one past event
    mockDefaultLoads([
      {
        id: 'e9',
        car_id: 'c2',
        occurred_on: '2025-12-01',
        event_type: 'repair',
        odometer_miles: 1000,
        cost_cents: 10000,
        title: 'Fix',
        notes: null,
        document_id: null,
        created_at: 't',
        updated_at: 't',
      },
    ]);

    renderPanel(inactiveCar);

    await waitFor(() => {
      expect(screen.getByText(/Cost: \$100\.00/i)).toBeTruthy();
    });
    expect(screen.getByLabelText('Add maintenance event')).toBeDisabled();
    expect(
      screen.getByLabelText('Edit maintenance event on 2025-12-01')
    ).not.toBeDisabled();
    expect(
      screen.getByLabelText('Delete maintenance event on 2025-12-01')
    ).not.toBeDisabled();
  });
});
