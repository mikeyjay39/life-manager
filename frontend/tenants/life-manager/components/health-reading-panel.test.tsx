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
      />
    </TenantThemeTestProvider>
  );
}

describe('HealthReadingPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue(defaultAuth());
    mockOnUnitSystemChange.mockClear();
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
    expect(mockAuthenticatedFetch).not.toHaveBeenCalled();
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

    // When filling metric weight and submitting
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
      expect(screen.getByLabelText('Weight in pounds')).toBeTruthy();
    });

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
      expect(screen.getByLabelText('Weight in kilograms')).toBeTruthy();
    });

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
      expect(screen.getByLabelText('Weight in kilograms')).toBeTruthy();
    });
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
      expect(screen.getByLabelText('Weight in kilograms').props.value).toBe('');
    });
  });

  it('given no member then first select keeps empty form ready without wipe race', async () => {
    mockAuthenticatedFetch.mockResolvedValue(jsonResponse([]));
    const { rerender } = renderPanel(null);

    expect(
      screen.getByText('Select or create a HealthMember to enter vitals.')
    ).toBeTruthy();
    expect(screen.getByLabelText('Weight in kilograms').props.editable).toBe(
      false
    );

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
      expect(screen.getByLabelText('Weight in kilograms').props.editable).toBe(
        true
      );
    });
  });

  it('given member A then null then B clears vitals from A', async () => {
    mockAuthenticatedFetch.mockResolvedValue(jsonResponse([]));
    const { rerender } = renderPanel(
      member({ id: 'm1', display_name: 'Alex' })
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Weight in kilograms')).toBeTruthy();
    });
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
      expect(screen.getByLabelText('Weight in kilograms').props.value).toBe('');
    });
  });

  it('given filled metric fields when unitSystem prop flips then converts form values', async () => {
    mockAuthenticatedFetch.mockResolvedValue(jsonResponse([]));
    const { rerender } = renderPanel(
      member({ id: 'm1', display_name: 'Alex' })
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Weight in kilograms')).toBeTruthy();
    });
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
});
