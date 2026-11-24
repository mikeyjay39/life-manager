import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ReactNative from 'react-native';

import { useAuth } from '@/contexts/AuthContext';
import { apiFetch, authenticatedFetch } from '@/lib/api/client';
import { useWebEscapeClose } from '@/hooks/use-web-escape-close';
import type { CarDto } from '@/lib/api/types';
import { formatUsdFromCents } from '@/lib/format/display';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';

import CarMaintenancePanel, {
  CAR_MAINTENANCE_LIST_COLUMN_FLEX,
  receiptDocumentTitlePrefill,
} from './car-maintenance-panel';

/** Flatten RN style arrays/objects and return the first defined `flex`. */
function styleFlex(style: unknown): number | undefined {
  if (style == null) {
    return undefined;
  }
  if (Array.isArray(style)) {
    for (let i = style.length - 1; i >= 0; i -= 1) {
      const found = styleFlex(style[i]);
      if (found != null) {
        return found;
      }
    }
    return undefined;
  }
  if (typeof style === 'object' && 'flex' in style) {
    const value = (style as { flex?: number }).flex;
    return typeof value === 'number' ? value : undefined;
  }
  return undefined;
}

/** Read flex from `ManagerDataListRow` cell wrappers under `{rowTestId}-cells`. */
function cellFlexAt(rowTestId: string, index: number): number | undefined {
  const cells = screen.getByTestId(`${rowTestId}-cells`);
  const child = (
    cells as { props?: { children?: unknown } }
  ).props?.children;
  const list = React.Children.toArray(child);
  const wrapper = list[index] as { props?: { style?: unknown } } | undefined;
  return styleFlex(wrapper?.props?.style);
}

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

vi.mock('@/hooks/use-web-escape-close', () => ({ useWebEscapeClose: vi.fn() }));

vi.mock('@/contexts/ProtonConnectContext', () => ({
  useProtonConnect: vi.fn(() => ({
    isSupported: false,
    session: null,
    isConnecting: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
  })),
}));

vi.mock('expo-document-picker', () => ({
  getDocumentAsync: vi.fn().mockResolvedValue({ canceled: true, assets: [] }),
}));

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>();
  return {
    ...actual,
    authenticatedFetch: vi.fn(),
    apiFetch: vi.fn(),
  };
});

const mockUseAuth = vi.mocked(useAuth);
const mockAuthenticatedFetch = vi.mocked(authenticatedFetch);
const mockApiFetch = vi.mocked(apiFetch);

const receiptDoc = {
  id: 'd-receipt-1',
  title: 'Old receipt',
  content: 'prior',
  tags: ['receipt'],
  created_at: 't',
  issued_date: null,
  expire_date: null,
  storage: null,
};

const newReceiptDoc = {
  id: 'd-receipt-new',
  title: 'Daily receipt',
  content: 'oil change',
  tags: ['receipt'],
  created_at: 't',
  issued_date: null,
  expire_date: null,
  storage: null,
};

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
    mockApiFetch.mockResolvedValue(
      new Response(JSON.stringify(newReceiptDoc), { status: 201 })
    );
  });

  function openAddEvent() {
    fireEvent.press(screen.getByLabelText('Add maintenance event'));
  }

  it('given no Car when render then prompts to select and disables add', async () => {
    // Given no selected Car
    renderPanel(null);
    // Then the empty state asks the user to select a car
    expect(
      screen.getByLabelText(
        'No Car selected. Choose a Car above to log maintenance events.'
      )
    ).toBeTruthy();
    expect(
      screen.getByText('Choose a Car above to log maintenance events.')
    ).toBeTruthy();
    expect(
      screen.queryByText('Select or create a Car to log maintenance events.')
    ).toBeNull();
    expect(screen.getByLabelText('Add maintenance event')).toBeDisabled();
    expect(screen.queryByLabelText('Maintenance event form')).toBeNull();
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

  it('Scenario: Dependent maintenance shows selection context', async () => {
    // Given a Car is selected
    renderPanel(activeCar);
    // Then maintenance shows Selected: without re-opening the picker alone
    await waitFor(() => {
      expect(screen.getByLabelText('Selected Car Daily')).toBeTruthy();
    });
    expect(screen.getByText('Selected: Daily')).toBeTruthy();
  });

  it('given events when rendering then form stays collapsed until Add event', async () => {
    // Given an active Car with history
    mockDefaultLoads([
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
    ]);

    renderPanel();

    await waitFor(() => {
      expect(
        screen.getByLabelText(`Cost ${formatUsdFromCents(5999)}`)
      ).toBeTruthy();
    });
    // Then history is visible without an always-open create form
    expect(screen.getByLabelText('Add maintenance event')).toBeTruthy();
    expect(screen.queryByLabelText('Maintenance event form')).toBeNull();
    expect(screen.queryByLabelText('Maintenance event date')).toBeNull();

    openAddEvent();

    expect(screen.getByLabelText('Maintenance event form')).toBeTruthy();
    expect(screen.getByLabelText('Maintenance event date')).toBeTruthy();
    expect(screen.getByLabelText('Save maintenance event')).toBeTruthy();
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

    openAddEvent();

    fireEvent.changeText(
      screen.getByLabelText('Maintenance odometer miles'),
      '50000'
    );
    fireEvent.changeText(
      screen.getByLabelText('Maintenance cost in dollars'),
      '59.99'
    );
    fireEvent.press(screen.getByLabelText('Save maintenance event'));

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
      expect(
        screen.getByLabelText(`Cost ${formatUsdFromCents(5999)}`)
      ).toBeTruthy();
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
      expect(screen.getByLabelText('Notes: old')).toBeTruthy();
    });
    expect(screen.queryByLabelText('Maintenance event form')).toBeNull();

    fireEvent.press(
      screen.getByLabelText('Edit maintenance event e1 on 2026-01-15')
    );
    expect(screen.getByLabelText('Maintenance event form')).toBeTruthy();
    fireEvent.changeText(
      screen.getByLabelText('Maintenance notes'),
      'updated'
    );
    fireEvent.press(screen.getByLabelText('Update maintenance event'));

    await waitFor(() => {
      expect(screen.getByLabelText('Notes: updated')).toBeTruthy();
    });
    expect(screen.queryByLabelText('Maintenance event form')).toBeNull();

    fireEvent.press(
      screen.getByLabelText('Delete maintenance event e1 on 2026-01-15')
    );
    fireEvent.press(screen.getByText('Delete'));

    await waitFor(() => {
      expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
        '/car-maintenance-events/e1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    await waitFor(() => {
      expect(screen.getByText('No maintenance events yet.')).toBeTruthy();
    });
  });

  it('given type filter with no matches when empty then filter stays available', async () => {
    // Given an oil-change event, then a tire filter returns none
    mockAuthenticatedFetch.mockImplementation(async (path: string) => {
      if (typeof path === 'string' && path.startsWith('/documents')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (typeof path === 'string' && path.includes('event_type=tire')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (typeof path === 'string' && path.startsWith('/car-maintenance-events')) {
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
    });

    renderPanel();

    await waitFor(() => {
      expect(
        screen.getByLabelText(`Cost ${formatUsdFromCents(5999)}`)
      ).toBeTruthy();
    });
    expect(screen.getByTestId('car-maintenance-type-filter-chrome')).toBeTruthy();
    expect(screen.getByLabelText('Maintenance type filter')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Filter Tire events'));

    await waitFor(() => {
      expect(screen.getByText('No matching maintenance events.')).toBeTruthy();
    });
    // Then the user can still clear the filter
    expect(screen.getByLabelText('Filter all event types')).toBeTruthy();
    expect(screen.getByLabelText('Add maintenance event')).toBeTruthy();
  });

  it('given maintenance history columns when weighted then Title flex exceeds Notes and Receipt', async () => {
    // Given the shared column flex map used by headers and cells
    const { title, notes, receipt, type } = CAR_MAINTENANCE_LIST_COLUMN_FLEX;

    // Then Title keeps the largest readable share; Type stays primary-weighted
    expect(title).toBeGreaterThan(notes);
    expect(title).toBeGreaterThan(receipt);
    expect(type).toBeGreaterThan(0);

    // Given a listed event with title, notes, and receipt text
    mockDefaultLoads(
      [
        {
          id: 'e-flex',
          car_id: 'c1',
          occurred_on: '2026-02-01',
          event_type: 'service',
          odometer_miles: 12000,
          cost_cents: 4500,
          title: 'Replace cabin air filter and inspect belts',
          notes: 'Dealer suggested follow-up in six months',
          document_id: 'd1',
          created_at: 't',
          updated_at: 't',
        },
      ],
      [
        {
          id: 'd1',
          title: 'Service receipt Feb',
          filename: 'receipt.pdf',
          content_type: 'application/pdf',
          size_bytes: 100,
          tags: [],
          created_at: 't',
          updated_at: 't',
        },
      ]
    );

    // When the history list renders on a wide layout (flex applies above stack break)
    const dimsSpy = vi
      .spyOn(ReactNative, 'useWindowDimensions')
      .mockReturnValue({ width: 1024, height: 800, scale: 1, fontScale: 1 });
    try {
      renderPanel();

      await waitFor(() => {
        expect(
          screen.getByLabelText(
            'Title: Replace cabin air filter and inspect belts'
          )
        ).toBeTruthy();
      });

      // Then rendered cell flex matches the map (type, title, …, notes, receipt)
      const rowId = 'car-maintenance-row-e-flex';
      expect(cellFlexAt(rowId, 1)).toBe(title);
      expect(cellFlexAt(rowId, 4)).toBe(notes);
      expect(cellFlexAt(rowId, 5)).toBe(receipt);
      expect(cellFlexAt(rowId, 1)!).toBeGreaterThan(cellFlexAt(rowId, 4)!);
      expect(cellFlexAt(rowId, 1)!).toBeGreaterThan(cellFlexAt(rowId, 5)!);
    } finally {
      dimsSpy.mockRestore();
    }
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
      expect(
        screen.getByLabelText(`Cost ${formatUsdFromCents(10000)}`)
      ).toBeTruthy();
    });
    expect(screen.getByLabelText('Add maintenance event')).toBeDisabled();
    expect(
      screen.getByLabelText('Edit maintenance event e9 on 2025-12-01')
    ).not.toBeDisabled();
    expect(
      screen.getByLabelText('Delete maintenance event e9 on 2025-12-01')
    ).not.toBeDisabled();

    // When editing on inactive Car then Create receipt stays hidden
    fireEvent.press(
      screen.getByLabelText('Edit maintenance event e9 on 2025-12-01')
    );
    expect(screen.getByLabelText('Maintenance event form')).toBeTruthy();
    expect(screen.queryByLabelText('Create receipt document')).toBeNull();
  });

  it('Scenario: Create receipt Document on new maintenance event', async () => {
    // Given active Car and Add event with no receipt selected
    renderPanel();
    await waitFor(() => {
      expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
        '/documents',
        expect.objectContaining({ method: 'GET' })
      );
    });
    openAddEvent();

    expect(screen.getByLabelText('Create receipt document')).toBeTruthy();
    expect(receiptDocumentTitlePrefill('Daily')).toBe('Daily receipt');

    // When create receipt succeeds
    fireEvent.press(screen.getByLabelText('Create receipt document'));
    expect(screen.getByLabelText('Create receipt document form')).toBeTruthy();
    expect(screen.getByPlaceholderText('Document title').props.value).toBe(
      'Daily receipt'
    );
    expect(screen.getByLabelText('Document tags').props.value).toBe('receipt');
    fireEvent.changeText(
      screen.getByPlaceholderText('Document content'),
      'Oil change invoice'
    );
    fireEvent.press(screen.getByLabelText('Submit'));

    // Then picker selects the new Document; event is not POSTed yet
    await waitFor(() => {
      expect(
        screen.getByLabelText('Linked receipt document')
      ).toBeTruthy();
    });
    expect(
      screen.getByLabelText('Linked receipt document').props.children).toBe('Daily receipt');
    expect(screen.queryByLabelText('Create receipt document form')).toBeNull();
    expect(
      mockAuthenticatedFetch.mock.calls.some(
        ([path, init]) =>
          path === '/car-maintenance-events' &&
          (init as RequestInit | undefined)?.method === 'POST'
      )
    ).toBe(false);
    expect(mockApiFetch).toHaveBeenCalled();
  });

  it('given a pending document load when receipt creation finishes first then the new receipt stays selected', async () => {
    // Given a document list request that started before receipt creation
    let resolveDocuments!: (response: Response) => void;
    const pendingDocuments = new Promise<Response>((resolve) => {
      resolveDocuments = resolve;
    });
    mockAuthenticatedFetch.mockImplementation(async (path: string) => {
      if (path === '/documents') return pendingDocuments;
      return new Response(JSON.stringify([]), { status: 200 });
    });
    renderPanel();
    await waitFor(() => {
      expect(screen.getByLabelText('Add maintenance event')).toBeTruthy();
    });
    openAddEvent();
    fireEvent.press(screen.getByLabelText('Create receipt document'));
    fireEvent.changeText(screen.getByPlaceholderText('Document content'), 'Receipt body');
    fireEvent.press(screen.getByLabelText('Submit'));
    await waitFor(() => {
      expect(screen.getByLabelText('Linked receipt document').props.children).toBe('Daily receipt');
    });

    // When the older GET returns a list without the new receipt
    await act(async () => {
      resolveDocuments(new Response(JSON.stringify([receiptDoc]), { status: 200 }));
      await pendingDocuments;
    });

    // Then the new receipt remains selected and no event write has occurred
    expect(screen.getByLabelText('Linked receipt document').props.children).toBe('Daily receipt');
    fireEvent.press(screen.getByLabelText('Change receipt document'));
    expect(screen.getByLabelText(`Choose document ${receiptDoc.title}`)).toBeTruthy();
    expect(screen.getByLabelText(`Choose document ${newReceiptDoc.title}`).props.accessibilityState.selected).toBe(true);
    expect(mockAuthenticatedFetch.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true);
  });

  it('Scenario: Confirm before replace existing receipt on edit', async () => {
    // Given edit of an event that already has receipt R1
    const listed = {
      id: 'e1',
      car_id: 'c1',
      occurred_on: '2026-01-15',
      event_type: 'service',
      odometer_miles: null,
      cost_cents: null,
      title: null,
      notes: null,
      document_id: receiptDoc.id,
      created_at: 't',
      updated_at: 't',
    };
    mockDefaultLoads([listed], [receiptDoc]);

    renderPanel();
    await waitFor(() => {
      expect(
        screen.getByLabelText(`Receipt: ${receiptDoc.title}`)
      ).toBeTruthy();
    });
    fireEvent.press(
      screen.getByLabelText('Edit maintenance event e1 on 2026-01-15')
    );
    await waitFor(() => {
      expect(
        screen.getByLabelText('Linked receipt document')
          .props.children
      ).toBe(receiptDoc.title);
    });

    // When start create receipt then ConfirmDialog asks to replace
    fireEvent.press(screen.getByLabelText('Create receipt document'));
    expect(screen.getByText('Replace receipt document?')).toBeTruthy();

    // When cancel then R1 stays selected and create form stays closed
    fireEvent.press(screen.getByLabelText('Dismiss dialog'));
    await waitFor(() => {
      expect(screen.queryByText('Replace receipt document?')).toBeNull();
    });
    expect(screen.queryByLabelText('Create receipt document form')).toBeNull();
    expect(
      screen.getByLabelText('Linked receipt document').props.children).toBe(receiptDoc.title);

    // When confirm replace and create succeeds then picker selects new Document
    fireEvent.press(screen.getByLabelText('Create receipt document'));
    fireEvent.press(screen.getByLabelText('Replace'));
    expect(screen.getByLabelText('Create receipt document form')).toBeTruthy();
    fireEvent.changeText(
      screen.getByPlaceholderText('Document content'),
      'New receipt body'
    );
    fireEvent.press(screen.getByLabelText('Submit'));

    await waitFor(() => {
      expect(
        screen.getByLabelText('Linked receipt document')
      ).toBeTruthy();
    });
    expect(
      screen.getByLabelText('Linked receipt document').props.children).toBe('Daily receipt');
    expect(
      mockAuthenticatedFetch.mock.calls.some(
        ([path, init]) =>
          path === '/car-maintenance-events/e1' &&
          (init as RequestInit | undefined)?.method === 'PUT'
      )
    ).toBe(false);
  });

  it('Scenario: Pick existing receipt still works', async () => {
    // Given owned Document D on Add event
    mockDefaultLoads([], [receiptDoc]);
    renderPanel();
    await waitFor(() => {
      expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
        '/documents',
        expect.objectContaining({ method: 'GET' })
      );
    });
    openAddEvent();

    fireEvent.press(screen.getByLabelText('Choose receipt document'));
    await waitFor(() => {
      expect(screen.getByLabelText(`Choose document ${receiptDoc.title}`)).toBeTruthy();
    });
    fireEvent.press(screen.getByLabelText(`Choose document ${receiptDoc.title}`));
    fireEvent.press(screen.getByLabelText('Select document'));
    // Validation needs title, notes, odometer, or cost in addition to document.
    fireEvent.changeText(screen.getByLabelText('Maintenance title'), 'Oil');
    fireEvent.press(screen.getByLabelText('Save maintenance event'));

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
    const body = JSON.parse(String((postCall![1] as RequestInit).body));
    expect(body.document_id).toBe(receiptDoc.id);
  });

  it('given no receipt when choosing then uses a searchable modal and applies only the confirmed selection', async () => {
    mockDefaultLoads([], [receiptDoc, newReceiptDoc]);
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText('Add maintenance event')).toBeTruthy());
    openAddEvent();
    fireEvent.changeText(screen.getByLabelText('Maintenance title'), 'Unsaved event');
    expect(screen.getByLabelText('Choose receipt document')).toBeTruthy();
    expect(screen.queryByText(receiptDoc.title)).toBeNull();
    expect(screen.queryByText(newReceiptDoc.title)).toBeNull();
    expect(screen.queryByLabelText('Receipt document picker')).toBeNull();

    fireEvent.press(screen.getByLabelText('Choose receipt document'));
    await waitFor(() => expect(screen.getByLabelText(`Choose document ${receiptDoc.title}`)).toBeTruthy());
    expect(screen.getByLabelText('Save maintenance event', { includeHiddenElements: true })).toBeDisabled();
    fireEvent.changeText(screen.getByLabelText('Search documents'), 'Daily');
    expect(screen.queryByLabelText(`Choose document ${receiptDoc.title}`)).toBeNull();
    fireEvent.press(screen.getByLabelText(`Choose document ${newReceiptDoc.title}`));
    expect(screen.queryByLabelText('Linked receipt document')).toBeNull();
    fireEvent.press(screen.getByLabelText('Select document'));
    expect(screen.queryByLabelText('Search documents')).toBeNull();
    expect(screen.getByLabelText('Linked receipt document').props.children).toBe(newReceiptDoc.title);
    expect(screen.getByLabelText('Maintenance title').props.value).toBe('Unsaved event');
    expect(screen.getByLabelText('Change receipt document')).toBeTruthy();
    expect(screen.getByLabelText('Remove receipt document')).toBeTruthy();
    expect(mockAuthenticatedFetch.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true);
  });

  it('given a stored receipt when searching its filename then shows existing file and date metadata', async () => {
    const fileReceipt = {
      ...receiptDoc,
      created_at: '2026-01-01T12:00:00Z',
      issued_date: '2026-01-01',
      expire_date: '2027-01-01',
      storage: { provider: 'proton', share_id: 'share', node_id: 'node', filename: 'invoice.pdf', mime_type: 'application/pdf' },
    };
    mockDefaultLoads([], [fileReceipt, newReceiptDoc]);
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText('Add maintenance event')).toBeTruthy());
    openAddEvent();
    fireEvent.press(screen.getByLabelText('Choose receipt document'));
    await waitFor(() => expect(screen.getByText('invoice.pdf')).toBeTruthy());
    fireEvent.changeText(screen.getByLabelText('Search documents'), 'INVOICE.PDF');
    expect(screen.getByLabelText(`Choose document ${receiptDoc.title}`)).toBeTruthy();
    expect(screen.queryByLabelText(`Choose document ${newReceiptDoc.title}`)).toBeNull();
    expect(screen.getByText('File type: application/pdf')).toBeTruthy();
    expect(screen.getByText(/^Created:/)).toBeTruthy();
    expect(screen.getByText(/^Issued:/)).toBeTruthy();
    expect(screen.getByText(/^Expires:/)).toBeTruthy();
  });

  it('given a created receipt file when searching its filename then shows its file type', async () => {
    // Given a receipt create response with file storage metadata
    const createdFileReceipt = {
      ...newReceiptDoc,
      storage: { provider: 'proton', share_id: 'share', node_id: 'node', filename: 'scan.jpg', mime_type: 'image/jpeg' },
    };
    mockApiFetch.mockResolvedValue(new Response(JSON.stringify(createdFileReceipt), { status: 201 }));
    mockDefaultLoads([], [receiptDoc]);
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText('Add maintenance event')).toBeTruthy());
    openAddEvent();
    fireEvent.press(screen.getByLabelText('Create receipt document'));
    fireEvent.changeText(screen.getByPlaceholderText('Document content'), 'Receipt body');
    fireEvent.press(screen.getByLabelText('Submit'));
    await waitFor(() => expect(screen.getByLabelText('Change receipt document')).toBeTruthy());

    // When the picker searches the new receipt filename
    fireEvent.press(screen.getByLabelText('Change receipt document'));
    fireEvent.changeText(screen.getByLabelText('Search documents'), 'SCAN.JPG');

    // Then only the new receipt matches and its file type shows
    expect(screen.getByLabelText(`Choose document ${newReceiptDoc.title}`)).toBeTruthy();
    expect(screen.queryByLabelText(`Choose document ${receiptDoc.title}`)).toBeNull();
    expect(screen.getByText('File type: image/jpeg')).toBeTruthy();
  });

  it('given a pending document load when it fails after receipt creation then the new receipt title stays linked', async () => {
    // Given a document list request that started before receipt creation
    let rejectDocuments!: (error: Error) => void;
    const pendingDocuments = new Promise<Response>((_resolve, reject) => {
      rejectDocuments = reject;
    });
    mockAuthenticatedFetch.mockImplementation(async (path: string) => {
      if (path === '/documents') return pendingDocuments;
      return new Response(JSON.stringify([]), { status: 200 });
    });
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText('Add maintenance event')).toBeTruthy());
    openAddEvent();
    fireEvent.press(screen.getByLabelText('Create receipt document'));
    fireEvent.changeText(screen.getByPlaceholderText('Document content'), 'Receipt body');
    fireEvent.press(screen.getByLabelText('Submit'));
    await waitFor(() => expect(screen.getByLabelText('Change receipt document')).toBeTruthy());

    // When the older GET fails
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => {
      rejectDocuments(new Error('network down'));
      await pendingDocuments.catch(() => undefined);
    });

    // Then the new receipt title stays linked and the picker offers the load error
    expect(screen.getByLabelText('Linked receipt document').props.children).toBe('Daily receipt');
    fireEvent.press(screen.getByLabelText('Change receipt document'));
    expect(screen.getByText('network down')).toBeTruthy();
  });

  it('given a created receipt when a later document load omits it then the list follows the server', async () => {
    // Given a receipt created after the first document load finished
    const listed = {
      id: 'e1', car_id: 'c1', occurred_on: '2026-01-15', event_type: 'service',
      odometer_miles: null, cost_cents: null, title: null, notes: null,
      document_id: receiptDoc.id, created_at: 't', updated_at: 't',
    };
    mockDefaultLoads([listed], [receiptDoc]);
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText(`Receipt: ${receiptDoc.title}`)).toBeTruthy());
    openAddEvent();
    fireEvent.press(screen.getByLabelText('Create receipt document'));
    fireEvent.changeText(screen.getByPlaceholderText('Document content'), 'Receipt body');
    fireEvent.press(screen.getByLabelText('Submit'));
    await waitFor(() => expect(screen.getByLabelText('Change receipt document')).toBeTruthy());

    // When edit starts a new document load that no longer has the receipt
    fireEvent.press(screen.getByLabelText('Edit maintenance event e1 on 2026-01-15'));
    await waitFor(() => {
      expect(mockAuthenticatedFetch.mock.calls.filter(([path]) => path === '/documents')).toHaveLength(2);
    });

    // Then the picker lists only the documents from the server
    fireEvent.press(screen.getByLabelText('Change receipt document'));
    await waitFor(() => expect(screen.getByLabelText(`Choose document ${receiptDoc.title}`)).toBeTruthy());
    expect(screen.queryByLabelText(`Choose document ${newReceiptDoc.title}`)).toBeNull();
  });

  it('given a pending receipt create when the Car changes then the response does not link to the new form', async () => {
    // Given a receipt create request that is still running
    let resolveCreate!: (response: Response) => void;
    mockApiFetch.mockReturnValue(new Promise<Response>((resolve) => {
      resolveCreate = resolve;
    }));
    mockDefaultLoads([], [receiptDoc]);
    const { rerender } = renderPanel();
    await waitFor(() => expect(screen.getByLabelText('Add maintenance event')).toBeTruthy());
    openAddEvent();
    fireEvent.press(screen.getByLabelText('Create receipt document'));
    fireEvent.changeText(screen.getByPlaceholderText('Document content'), 'Receipt body');
    fireEvent.press(screen.getByLabelText('Submit'));
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

    // When the Car changes and then the create response arrives
    rerender(<TenantThemeTestProvider theme={defaultResolvedTheme}>
      <CarMaintenancePanel selectedCar={{ ...activeCar, id: 'another-car' }} />
    </TenantThemeTestProvider>);
    await act(async () => {
      resolveCreate(new Response(JSON.stringify(newReceiptDoc), { status: 201 }));
    });

    // Then the new Car form has no linked receipt
    await waitFor(() => expect(screen.getByLabelText('Add maintenance event')).toBeTruthy());
    openAddEvent();
    expect(screen.queryByLabelText('Linked receipt document')).toBeNull();
    expect(screen.getByLabelText('Choose receipt document')).toBeTruthy();
  });

  it.each(['Cancel document selection', 'Close document picker', 'escape', 'back'])(
    'given a linked receipt when Change is dismissed with %s then preserves the link and unsaved fields', async (dismissal) => {
      mockDefaultLoads([], [receiptDoc, newReceiptDoc]);
      renderPanel();
      await waitFor(() => expect(screen.getByLabelText('Add maintenance event')).toBeTruthy());
      openAddEvent();
      fireEvent.press(screen.getByLabelText('Choose receipt document'));
      await waitFor(() => expect(screen.getByLabelText(`Choose document ${receiptDoc.title}`)).toBeTruthy());
      fireEvent.press(screen.getByLabelText(`Choose document ${receiptDoc.title}`));
      fireEvent.press(screen.getByLabelText('Select document'));
      fireEvent.changeText(screen.getByLabelText('Maintenance title'), 'Keep title');
      fireEvent.changeText(screen.getByLabelText('Maintenance notes'), 'Keep notes');

      fireEvent.press(screen.getByLabelText('Change receipt document'));
      expect(screen.getByLabelText(`Choose document ${receiptDoc.title}`).props.accessibilityState.selected).toBe(true);
      expect(screen.getByText('Current selection')).toBeTruthy();
      fireEvent.changeText(screen.getByLabelText('Search documents'), 'Daily');
      fireEvent.press(screen.getByLabelText(`Choose document ${newReceiptDoc.title}`));
      if (dismissal === 'escape') {
        act(() => vi.mocked(useWebEscapeClose).mock.calls.at(-1)![1]());
      } else if (dismissal === 'back') {
        const modal = screen.UNSAFE_getAllByType(ReactNative.Modal).find((node) => node.props.visible);
        fireEvent(modal!, 'requestClose');
      } else {
        fireEvent.press(screen.getByLabelText(dismissal));
      }
      expect(screen.queryByLabelText('Search documents')).toBeNull();
      expect(screen.getByLabelText('Linked receipt document').props.children).toBe(receiptDoc.title);
      expect(screen.getByLabelText('Maintenance title').props.value).toBe('Keep title');
      expect(screen.getByLabelText('Maintenance notes').props.value).toBe('Keep notes');
      fireEvent.press(screen.getByLabelText('Change receipt document'));
      expect(screen.getByLabelText('Search documents').props.value).toBe('');
      expect(screen.getByLabelText(`Choose document ${receiptDoc.title}`).props.accessibilityState.selected).toBe(true);
      expect(mockAuthenticatedFetch.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true);
    }
  );

  it('given a linked receipt when Change is confirmed then Remove clears only the form link', async () => {
    mockDefaultLoads([], [receiptDoc, newReceiptDoc]);
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText('Add maintenance event')).toBeTruthy());
    openAddEvent();
    fireEvent.press(screen.getByLabelText('Choose receipt document'));
    await waitFor(() => expect(screen.getByLabelText(`Choose document ${receiptDoc.title}`)).toBeTruthy());
    fireEvent.press(screen.getByLabelText(`Choose document ${receiptDoc.title}`));
    fireEvent.press(screen.getByLabelText('Select document'));
    fireEvent.press(screen.getByLabelText('Change receipt document'));
    fireEvent.press(screen.getByLabelText(`Choose document ${newReceiptDoc.title}`));
    fireEvent.press(screen.getByLabelText('Select document'));
    expect(screen.getByLabelText('Linked receipt document').props.children).toBe(newReceiptDoc.title);
    fireEvent.press(screen.getByLabelText('Remove receipt document'));
    expect(screen.queryByLabelText('Linked receipt document')).toBeNull();
    expect(screen.getByLabelText('Choose receipt document')).toBeTruthy();
    expect(screen.queryByText(receiptDoc.title)).toBeNull();
    fireEvent.press(screen.getByLabelText('Choose receipt document'));
    expect(screen.getByLabelText(`Choose document ${receiptDoc.title}`)).toBeTruthy();
    expect(screen.getByLabelText(`Choose document ${newReceiptDoc.title}`)).toBeTruthy();
    expect(mockAuthenticatedFetch.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true);
  });

  it('given an open receipt picker when the Car changes then closes and clears its draft', async () => {
    mockDefaultLoads([], [receiptDoc]);
    const { rerender } = renderPanel();
    await waitFor(() => expect(screen.getByLabelText('Add maintenance event')).toBeTruthy());
    openAddEvent();
    fireEvent.press(screen.getByLabelText('Choose receipt document'));
    expect(screen.getByLabelText('Search documents')).toBeTruthy();
    rerender(<TenantThemeTestProvider theme={defaultResolvedTheme}>
      <CarMaintenancePanel selectedCar={{ ...activeCar, id: 'another-car' }} />
    </TenantThemeTestProvider>);
    expect(screen.queryByLabelText('Search documents')).toBeNull();
    expect(screen.queryByLabelText('Maintenance event form')).toBeNull();
  });
});
