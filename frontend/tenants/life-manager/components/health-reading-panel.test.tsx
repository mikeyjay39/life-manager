import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { useAuth } from '@/contexts/AuthContext';
import { authenticatedFetch } from '@/lib/api/client';
import type { HealthMemberDto, HealthReadingDto } from '@/lib/api/types';
import type { UnitSystem } from '@/lib/health/units';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';

import HealthReadingPanel from './health-reading-panel';

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
            onPress: () => onChange({ type: 'set' }, new Date(2026, 2, 1)),
          },
          ReactLib.createElement(Text, null, 'Confirm')
        )
      ),
  };
});

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
const mockOnUnitSystemChange = vi.fn(async (_next: UnitSystem) => undefined);
const mockOnReadingsChanged = vi.fn();

function member(
  overrides: Partial<HealthMemberDto> & Pick<HealthMemberDto, 'id' | 'display_name'>
): HealthMemberDto {
  return {
    birth_date: null,
    notes: null,
    active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deactivated_at: null,
    ...overrides,
  };
}

function reading(
  overrides: Partial<HealthReadingDto> & Pick<HealthReadingDto, 'id' | 'recorded_on'>
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

function defaultAuth(
  overrides: Partial<ReturnType<typeof useAuth>> = {}
): ReturnType<typeof useAuth> {
  return {
    token: 'tok',
    handleUnauthorized: vi.fn(),
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useAuth>;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}


function StatefulReadingPanel({
  selected,
  initialUnit = 'metric' as UnitSystem,
}: {
  selected: HealthMemberDto | null;
  initialUnit?: UnitSystem;
}) {
  const [unitSystem, setUnitSystem] = React.useState<UnitSystem>(initialUnit);
  return (
    <TenantThemeTestProvider theme={defaultResolvedTheme}>
      <HealthReadingPanel
        selectedMember={selected}
        unitSystem={unitSystem}
        onUnitSystemChange={async (next) => {
          mockOnUnitSystemChange(next);
          setUnitSystem(next);
        }}
        unitPreferenceReady
        onReadingsChanged={mockOnReadingsChanged}
      />
    </TenantThemeTestProvider>
  );
}

function renderPanel(
  selected: HealthMemberDto | null,
  opts: { unitSystem?: UnitSystem; unitPreferenceReady?: boolean } = {}
) {
  return render(
    <TenantThemeTestProvider theme={defaultResolvedTheme}>
      <HealthReadingPanel
        selectedMember={selected}
        unitSystem={opts.unitSystem ?? 'metric'}
        onUnitSystemChange={mockOnUnitSystemChange}
        unitPreferenceReady={opts.unitPreferenceReady ?? true}
        onReadingsChanged={mockOnReadingsChanged}
      />
    </TenantThemeTestProvider>
  );
}

async function openAddReading() {
  fireEvent.press(screen.getByLabelText('Add reading'));
  await waitFor(() => {
    expect(screen.getByLabelText('Health reading form')).toBeTruthy();
  });
}

describe('HealthReadingPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue(defaultAuth());
    mockOnUnitSystemChange.mockClear();
    mockOnReadingsChanged.mockClear();
    mockAuthenticatedFetch.mockResolvedValue(jsonResponse([]));
  });

  it('given no token when rendering then shows sign-in message', () => {
    mockUseAuth.mockReturnValue(
      defaultAuth({ token: null, isAuthenticated: false })
    );
    renderPanel(member({ id: 'm1', display_name: 'Alex' }));
    expect(
      screen.getByText('Sign in to submit and view health readings.')
    ).toBeTruthy();
    expect(mockAuthenticatedFetch).not.toHaveBeenCalled();
  });

  it('given no member when rendering then prompts to select and skips list fetch', async () => {
    renderPanel(null);
    expect(
      screen.getByText('Select or create a HealthMember to enter vitals.')
    ).toBeTruthy();
    expect(screen.getByLabelText('Add reading').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(screen.queryByLabelText('Health reading form')).toBeNull();
    expect(mockAuthenticatedFetch).not.toHaveBeenCalled();
  });

  it('given empty list GET failure when loading then shows list error not empty success', async () => {
    mockAuthenticatedFetch.mockResolvedValue(
      new Response('upstream down', { status: 500 })
    );

    renderPanel(member({ id: 'm1', display_name: 'Alex' }));

    await waitFor(() => {
      expect(screen.getByText(/Request failed \(500\)/)).toBeTruthy();
    });
    expect(screen.queryByText('No readings yet.')).toBeNull();
  });

  it('given readings when rendering then form stays collapsed until Add reading', async () => {
    const existing = reading({
      id: 'r-list',
      recorded_on: '2026-03-01',
      weight_kg: 70,
      notes: 'listed',
    });
    mockAuthenticatedFetch.mockResolvedValue(jsonResponse([existing]));

    renderPanel(member({ id: 'm1', display_name: 'Alex' }));

    await waitFor(() => {
      expect(screen.getByText('listed')).toBeTruthy();
    });
    expect(screen.getByTestId('health-reading-data-list')).toBeTruthy();
    expect(screen.getByTestId('health-reading-row-r-list')).toBeTruthy();
    expect(screen.getByLabelText('Add reading')).toBeTruthy();
    expect(screen.queryByLabelText('Health reading form')).toBeNull();

    await openAddReading();
    expect(screen.getByLabelText('Weight in kilograms')).toBeTruthy();
  });

  it('given metric mode when submitting weight then POSTs weight_kg and refreshes history', async () => {
    // Given selected member and empty history
    const created = reading({
      id: 'r1',
      recorded_on: '2026-03-01',
      weight_kg: 70.5,
    });
    mockAuthenticatedFetch
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse(created, 201))
      .mockResolvedValueOnce(jsonResponse([created]));

    renderPanel(member({ id: 'm1', display_name: 'Alex' }));

    await waitFor(() => {
      expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
        '/health-readings?health_member_id=m1',
        expect.objectContaining({ method: 'GET' })
      );
    });

    // When opening create, filling metric weight, and submitting
    await openAddReading();
    fireEvent.changeText(screen.getByLabelText('Weight in kilograms'), '70.5');
    fireEvent.press(screen.getByLabelText('Save health reading'));

    // Then POST uses metric field names and history shows the reading
    await waitFor(() => {
      expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
        '/health-readings',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"weight_kg":70.5'),
        })
      );
    });
    const postCall = mockAuthenticatedFetch.mock.calls.find(
      (c) => c[0] === '/health-readings' && c[1]?.method === 'POST'
    );
    expect(postCall?.[1]?.body).toBeTruthy();
    const payload = JSON.parse(String(postCall?.[1]?.body));
    expect(payload).not.toHaveProperty('weight_lb');
    expect(payload.height_cm).toBeNull();

    await waitFor(() => {
      expect(screen.getByText('70.5 kg')).toBeTruthy();
    });
  });

  it('given imperial mode when submitting then converts to weight_kg and height_cm only', async () => {
    const created = reading({
      id: 'r2',
      recorded_on: '2026-03-01',
      weight_kg: 70,
      height_cm: 180.1,
    });
    mockAuthenticatedFetch
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse(created, 201))
      .mockResolvedValueOnce(jsonResponse([created]));

    renderPanel(member({ id: 'm1', display_name: 'Alex' }), {
      unitSystem: 'imperial',
    });

    await waitFor(() => {
      expect(mockAuthenticatedFetch).toHaveBeenCalled();
    });
    await openAddReading();
    expect(screen.getByLabelText('Weight in pounds')).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText('Height feet'), '5');
    fireEvent.changeText(screen.getByLabelText('Height inches'), '10.9');
    fireEvent.changeText(screen.getByLabelText('Weight in pounds'), '154.3');
    fireEvent.press(screen.getByLabelText('Save health reading'));

    await waitFor(() => {
      expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
        '/health-readings',
        expect.objectContaining({ method: 'POST' })
      );
    });
    const postCall = mockAuthenticatedFetch.mock.calls.find(
      (c) => c[0] === '/health-readings' && c[1]?.method === 'POST'
    );
    const payload = JSON.parse(String(postCall?.[1]?.body));
    expect(payload.weight_kg).toBe(70);
    expect(payload.height_cm).toBe(180.1);
    expect(payload).not.toHaveProperty('weight_lb');
    expect(payload).not.toHaveProperty('height_feet');
    expect(payload).not.toHaveProperty('height_inches');
  });

  it('given stored metric reading when toggling units then history labels change', async () => {
    const stored = reading({
      id: 'r3',
      recorded_on: '2026-02-01',
      weight_kg: 70,
    });
    mockAuthenticatedFetch.mockResolvedValue(jsonResponse([stored]));

    render(
      <StatefulReadingPanel selected={member({ id: 'm1', display_name: 'Alex' })} />
    );

    await waitFor(() => {
      expect(screen.getByText(/70(\.0)? kg/)).toBeTruthy();
    });

    fireEvent.press(screen.getByLabelText('Use imperial units'));

    await waitFor(() => {
      expect(screen.getByText(/154\.3 lb/)).toBeTruthy();
    });
    expect(mockOnUnitSystemChange).toHaveBeenCalledWith('imperial');

    fireEvent.press(screen.getByLabelText('Use metric units'));

    await waitFor(() => {
      expect(screen.getByText(/70(\.0)? kg/)).toBeTruthy();
    });
  });

  it('given filled metric fields when toggling to imperial then converts form values', async () => {
    mockAuthenticatedFetch.mockResolvedValue(jsonResponse([]));
    render(
      <StatefulReadingPanel selected={member({ id: 'm1', display_name: 'Alex' })} />
    );

    await waitFor(() => {
      expect(mockAuthenticatedFetch).toHaveBeenCalled();
    });
    await openAddReading();
    expect(screen.getByLabelText('Weight in kilograms')).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText('Height in centimetres'), '180');
    fireEvent.changeText(screen.getByLabelText('Weight in kilograms'), '70');
    fireEvent.press(screen.getByLabelText('Use imperial units'));

    await waitFor(() => {
      expect(screen.getByLabelText('Height feet').props.value).toBe('5');
      expect(screen.getByLabelText('Height inches').props.value).toBe('10.9');
      expect(screen.getByLabelText('Weight in pounds').props.value).toBe(
        '154.3'
      );
    });
  });

  it('given filled fields when selected member changes then clears vitals', async () => {
    mockAuthenticatedFetch.mockResolvedValue(jsonResponse([]));
    const { rerender } = renderPanel(
      member({ id: 'm1', display_name: 'Alex' })
    );

    await waitFor(() => {
      expect(mockAuthenticatedFetch).toHaveBeenCalled();
    });
    await openAddReading();
    fireEvent.changeText(screen.getByLabelText('Weight in kilograms'), '70');

    rerender(
      <TenantThemeTestProvider theme={defaultResolvedTheme}>
        <HealthReadingPanel
          selectedMember={member({ id: 'm2', display_name: 'Sam' })}
          unitSystem="metric"
          onUnitSystemChange={mockOnUnitSystemChange}
          unitPreferenceReady
        />
      </TenantThemeTestProvider>
    );

    await waitFor(() => {
      expect(screen.queryByLabelText('Health reading form')).toBeNull();
    });
    await openAddReading();
    expect(screen.getByLabelText('Weight in kilograms').props.value).toBe('');
  });

  it('given history for member A when switching to B before fetch ends then clears stale rows', async () => {
    // Given member A history is on screen
    let resolveB!: (value: Response) => void;
    mockAuthenticatedFetch.mockResolvedValueOnce(
      jsonResponse([
        reading({
          id: 'r-a',
          health_member_id: 'm1',
          recorded_on: '2026-01-10',
          notes: 'Alex only',
        }),
      ])
    );
    const { rerender } = renderPanel(
      member({ id: 'm1', display_name: 'Alex' })
    );
    await waitFor(() => {
      expect(screen.getByLabelText('Reading on 2026-01-10')).toBeTruthy();
    });

    // When switch to B while B's fetch is still in flight
    mockAuthenticatedFetch.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveB = resolve;
      })
    );
    rerender(
      <TenantThemeTestProvider theme={defaultResolvedTheme}>
        <HealthReadingPanel
          selectedMember={member({ id: 'm2', display_name: 'Sam' })}
          unitSystem="metric"
          onUnitSystemChange={mockOnUnitSystemChange}
          unitPreferenceReady
        />
      </TenantThemeTestProvider>
    );

    // Then Alex rows are gone and skeletons show for the empty load
    await waitFor(() => {
      expect(screen.queryByLabelText('Reading on 2026-01-10')).toBeNull();
    });
    expect(screen.getByLabelText('Loading readings')).toBeTruthy();

    resolveB(jsonResponse([]));
    await waitFor(() => {
      expect(screen.queryByLabelText('Loading readings')).toBeNull();
    });
  });

  it('given no member then first select keeps empty form ready without wipe race', async () => {
    mockAuthenticatedFetch.mockResolvedValue(jsonResponse([]));
    const { rerender } = renderPanel(null);

    expect(
      screen.getByText('Select or create a HealthMember to enter vitals.')
    ).toBeTruthy();
    expect(screen.queryByLabelText('Health reading form')).toBeNull();

    rerender(
      <TenantThemeTestProvider theme={defaultResolvedTheme}>
        <HealthReadingPanel
          selectedMember={member({ id: 'm1', display_name: 'Alex' })}
          unitSystem="metric"
          onUnitSystemChange={mockOnUnitSystemChange}
          unitPreferenceReady
        />
      </TenantThemeTestProvider>
    );

    await waitFor(() => {
      expect(mockAuthenticatedFetch).toHaveBeenCalled();
    });
    await openAddReading();
    expect(screen.getByLabelText('Weight in kilograms').props.editable).toBe(
      true
    );
  });

  it('given member A then null then B clears vitals from A', async () => {
    mockAuthenticatedFetch.mockResolvedValue(jsonResponse([]));
    const { rerender } = renderPanel(
      member({ id: 'm1', display_name: 'Alex' })
    );

    await waitFor(() => {
      expect(mockAuthenticatedFetch).toHaveBeenCalled();
    });
    await openAddReading();
    fireEvent.changeText(screen.getByLabelText('Weight in kilograms'), '70');

    rerender(
      <TenantThemeTestProvider theme={defaultResolvedTheme}>
        <HealthReadingPanel
          selectedMember={null}
          unitSystem="metric"
          onUnitSystemChange={mockOnUnitSystemChange}
          unitPreferenceReady
        />
      </TenantThemeTestProvider>
    );

    rerender(
      <TenantThemeTestProvider theme={defaultResolvedTheme}>
        <HealthReadingPanel
          selectedMember={member({ id: 'm2', display_name: 'Sam' })}
          unitSystem="metric"
          onUnitSystemChange={mockOnUnitSystemChange}
          unitPreferenceReady
        />
      </TenantThemeTestProvider>
    );

    await waitFor(() => {
      expect(mockAuthenticatedFetch).toHaveBeenCalled();
    });
    await openAddReading();
    expect(screen.getByLabelText('Weight in kilograms').props.value).toBe('');
  });

  it('given filled metric fields when unitSystem prop flips then converts form values', async () => {
    mockAuthenticatedFetch.mockResolvedValue(jsonResponse([]));
    const { rerender } = renderPanel(
      member({ id: 'm1', display_name: 'Alex' })
    );

    await waitFor(() => {
      expect(mockAuthenticatedFetch).toHaveBeenCalled();
    });
    await openAddReading();
    fireEvent.changeText(screen.getByLabelText('Height in centimetres'), '180');
    fireEvent.changeText(screen.getByLabelText('Weight in kilograms'), '70');

    rerender(
      <TenantThemeTestProvider theme={defaultResolvedTheme}>
        <HealthReadingPanel
          selectedMember={member({ id: 'm1', display_name: 'Alex' })}
          unitSystem="imperial"
          onUnitSystemChange={mockOnUnitSystemChange}
          unitPreferenceReady
        />
      </TenantThemeTestProvider>
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Height feet').props.value).toBe('5');
      expect(screen.getByLabelText('Height inches').props.value).toBe('10.9');
      expect(screen.getByLabelText('Weight in pounds').props.value).toBe(
        '154.3'
      );
    });
  });


  it('given empty vitals when submitting then shows validation and does not POST create', async () => {
    mockAuthenticatedFetch.mockResolvedValue(jsonResponse([]));
    renderPanel(member({ id: 'm1', display_name: 'Alex' }));

    await waitFor(() => {
      expect(mockAuthenticatedFetch).toHaveBeenCalled();
    });
    mockAuthenticatedFetch.mockClear();

    await openAddReading();
    fireEvent.press(screen.getByLabelText('Save health reading'));

    await waitFor(() => {
      expect(
        screen.getByText(/Enter at least one vital or notes/i)
      ).toBeTruthy();
    });
    expect(mockAuthenticatedFetch).not.toHaveBeenCalled();
  });

  it('given duplicate date from API when submitting then shows error and keeps list', async () => {
    const existing = reading({
      id: 'r4',
      recorded_on: '2026-03-01',
      weight_kg: 68,
      notes: 'existing',
    });
    mockAuthenticatedFetch
      .mockResolvedValueOnce(jsonResponse([existing]))
      .mockResolvedValueOnce(
        new Response('duplicate recorded_on for this HealthMember', {
          status: 400,
        })
      );

    renderPanel(member({ id: 'm1', display_name: 'Alex' }));

    await waitFor(() => {
      expect(screen.getByText('existing')).toBeTruthy();
    });

    await openAddReading();
    fireEvent.changeText(screen.getByLabelText('Weight in kilograms'), '70');
    fireEvent.press(screen.getByLabelText('Save health reading'));

    await waitFor(() => {
      expect(screen.getByText(/Request failed \(400\)/)).toBeTruthy();
    });
    expect(screen.getByText('existing')).toBeTruthy();
    expect(
      mockAuthenticatedFetch.mock.calls.filter(
        (c) =>
          String(c[0]).startsWith('/health-readings') && c[1]?.method === 'GET'
      )
    ).toHaveLength(1);
  });

  it('given metric mode when editing weight then PUTs weight_kg and refreshes history', async () => {
    // Given a reading in history
    const existing = reading({
      id: 'r-edit',
      recorded_on: '2026-03-01',
      weight_kg: 68,
    });
    const updated = reading({
      id: 'r-edit',
      recorded_on: '2026-03-01',
      weight_kg: 71,
    });
    mockAuthenticatedFetch
      .mockResolvedValueOnce(jsonResponse([existing]))
      .mockResolvedValueOnce(jsonResponse(updated))
      .mockResolvedValueOnce(jsonResponse([updated]));

    renderPanel(member({ id: 'm1', display_name: 'Alex' }));

    await waitFor(() => {
      expect(screen.getByText('68 kg')).toBeTruthy();
    });

    // When editing weight and saving
    fireEvent.press(screen.getByLabelText('Edit reading on 2026-03-01'));
    await waitFor(() => {
      expect(screen.getByLabelText('Weight in kilograms').props.value).toBe(
        '68'
      );
    });
    fireEvent.changeText(screen.getByLabelText('Weight in kilograms'), '71');
    fireEvent.press(screen.getByLabelText('Update health reading'));

    // Then PUT sends metric weight and list shows the new value
    await waitFor(() => {
      expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
        '/health-readings/r-edit',
        expect.objectContaining({
          method: 'PUT',
          body: expect.stringContaining('"weight_kg":71'),
        })
      );
    });
    await waitFor(() => {
      expect(screen.getByText('71 kg')).toBeTruthy();
    });
    expect(mockOnReadingsChanged).toHaveBeenCalled();
  });

  it('given imperial mode when editing weight then PUT sends weight_kg and list shows lb', async () => {
    const existing = reading({
      id: 'r-imp',
      recorded_on: '2026-03-02',
      weight_kg: 70,
    });
    const updated = reading({
      id: 'r-imp',
      recorded_on: '2026-03-02',
      weight_kg: 72,
    });
    mockAuthenticatedFetch
      .mockResolvedValueOnce(jsonResponse([existing]))
      .mockResolvedValueOnce(jsonResponse(updated))
      .mockResolvedValueOnce(jsonResponse([updated]));

    renderPanel(member({ id: 'm1', display_name: 'Alex' }), {
      unitSystem: 'imperial',
    });

    await waitFor(() => {
      expect(screen.getByText(/154\.3 lb/)).toBeTruthy();
    });

    fireEvent.press(screen.getByLabelText('Edit reading on 2026-03-02'));
    await waitFor(() => {
      expect(screen.getByLabelText('Weight in pounds').props.value).toBe(
        '154.3'
      );
    });
    fireEvent.changeText(screen.getByLabelText('Weight in pounds'), '158.7');
    fireEvent.press(screen.getByLabelText('Update health reading'));

    await waitFor(() => {
      expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
        '/health-readings/r-imp',
        expect.objectContaining({ method: 'PUT' })
      );
    });
    const putCall = mockAuthenticatedFetch.mock.calls.find(
      (c) => c[0] === '/health-readings/r-imp' && c[1]?.method === 'PUT'
    );
    const payload = JSON.parse(String(putCall?.[1]?.body));
    expect(payload.weight_kg).toBe(72);
    expect(payload).not.toHaveProperty('weight_lb');
    expect(payload).not.toHaveProperty('health_member_id');

    await waitFor(() => {
      expect(screen.getByText(/158\.7 lb/)).toBeTruthy();
    });
    expect(mockOnReadingsChanged).toHaveBeenCalled();
  });

  it('given delete then cancel on dialog then reading remains', async () => {
    const existing = reading({
      id: 'r-keep',
      recorded_on: '2026-03-03',
      weight_kg: 69,
      notes: 'keep-me',
    });
    mockAuthenticatedFetch.mockResolvedValue(jsonResponse([existing]));

    renderPanel(member({ id: 'm1', display_name: 'Alex' }));

    await waitFor(() => {
      expect(screen.getByText('keep-me')).toBeTruthy();
    });

    fireEvent.press(screen.getByLabelText('Delete reading on 2026-03-03'));
    await waitFor(() => {
      expect(screen.getByText('Delete reading?')).toBeTruthy();
    });
    fireEvent.press(screen.getByLabelText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByText('Delete reading?')).toBeNull();
    });
    expect(screen.getByText('keep-me')).toBeTruthy();
    expect(
      mockAuthenticatedFetch.mock.calls.some((c) => c[1]?.method === 'DELETE')
    ).toBe(false);
  });

  it('given delete confirm then reading is removed from the list', async () => {
    const existing = reading({
      id: 'r-gone',
      recorded_on: '2026-03-04',
      weight_kg: 67,
      notes: 'remove-me',
    });
    mockAuthenticatedFetch
      .mockResolvedValueOnce(jsonResponse([existing]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(jsonResponse([]));

    renderPanel(member({ id: 'm1', display_name: 'Alex' }));

    await waitFor(() => {
      expect(screen.getByText('remove-me')).toBeTruthy();
    });

    fireEvent.press(screen.getByLabelText('Delete reading on 2026-03-04'));
    await waitFor(() => {
      expect(screen.getByText('Delete reading?')).toBeTruthy();
    });
    fireEvent.press(screen.getByLabelText('Delete'));

    await waitFor(() => {
      expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
        '/health-readings/r-gone',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
    await waitFor(() => {
      expect(screen.queryByText('remove-me')).toBeNull();
      expect(screen.getByText('No readings yet.')).toBeTruthy();
    });
    expect(mockOnReadingsChanged).toHaveBeenCalled();
  });

  it('given recorded_on conflict on edit then shows API error and keeps list', async () => {
    const existing = reading({
      id: 'r-a',
      recorded_on: '2026-03-05',
      weight_kg: 70,
      notes: 'first',
    });
    const other = reading({
      id: 'r-b',
      recorded_on: '2026-03-06',
      weight_kg: 71,
      notes: 'second',
    });
    mockAuthenticatedFetch
      .mockResolvedValueOnce(jsonResponse([other, existing]))
      .mockResolvedValueOnce(
        new Response('duplicate recorded_on for this HealthMember', {
          status: 400,
        })
      );

    renderPanel(member({ id: 'm1', display_name: 'Alex' }));

    await waitFor(() => {
      expect(screen.getByText('first')).toBeTruthy();
    });

    fireEvent.press(screen.getByLabelText('Edit reading on 2026-03-05'));
    await waitFor(() => {
      expect(screen.getByLabelText('Update health reading')).toBeTruthy();
    });
    // Change date onto the other reading's day (DatePicker mock sets 2026-03-01;
    // set via change on recorded date is not available — use weight path and
    // mock conflict on whatever date is sent). Prefer editing the date field
    // through the form's recordedOn by pressing the update after changing weight
    // while API returns conflict for recorded_on.
    fireEvent.changeText(screen.getByLabelText('Weight in kilograms'), '72');
    fireEvent.press(screen.getByLabelText('Update health reading'));

    await waitFor(() => {
      expect(screen.getByText(/Request failed \(400\)/)).toBeTruthy();
    });
    expect(screen.getByText('first')).toBeTruthy();
    expect(screen.getByText('second')).toBeTruthy();
    expect(mockOnReadingsChanged).not.toHaveBeenCalled();
  });

  it('given delete API failure then keeps row and shows error', async () => {
    const existing = reading({
      id: 'r-fail',
      recorded_on: '2026-03-07',
      weight_kg: 66,
      notes: 'still-here',
    });
    mockAuthenticatedFetch
      .mockResolvedValueOnce(jsonResponse([existing]))
      .mockResolvedValueOnce(
        new Response('delete failed', { status: 500 })
      );

    renderPanel(member({ id: 'm1', display_name: 'Alex' }));

    await waitFor(() => {
      expect(screen.getByText('still-here')).toBeTruthy();
    });

    fireEvent.press(screen.getByLabelText('Delete reading on 2026-03-07'));
    await waitFor(() => {
      expect(screen.getByText('Delete reading?')).toBeTruthy();
    });
    fireEvent.press(screen.getByLabelText('Delete'));

    await waitFor(() => {
      expect(screen.getByText(/Request failed \(500\)/)).toBeTruthy();
    });
    expect(screen.getByText('still-here')).toBeTruthy();
    expect(mockOnReadingsChanged).not.toHaveBeenCalled();
  });

  it('given delete returns 404 then keeps row removed and refreshes', async () => {
    const existing = reading({
      id: 'r-404',
      recorded_on: '2026-03-08',
      weight_kg: 65,
      notes: 'already-gone',
    });
    mockAuthenticatedFetch
      .mockResolvedValueOnce(jsonResponse([existing]))
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(jsonResponse([]));

    renderPanel(member({ id: 'm1', display_name: 'Alex' }));

    await waitFor(() => {
      expect(screen.getByText('already-gone')).toBeTruthy();
    });

    fireEvent.press(screen.getByLabelText('Delete reading on 2026-03-08'));
    await waitFor(() => {
      expect(screen.getByText('Delete reading?')).toBeTruthy();
    });
    fireEvent.press(screen.getByLabelText('Delete'));

    await waitFor(() => {
      expect(screen.queryByText('already-gone')).toBeNull();
      expect(screen.getByText('No readings yet.')).toBeTruthy();
    });
    expect(mockOnReadingsChanged).toHaveBeenCalled();
  });
});
