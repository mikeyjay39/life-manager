import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { useAuth } from '@/contexts/AuthContext';
import { authenticatedFetch } from '@/lib/api/client';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';
import type { HealthMemberDto } from '@/lib/api/types';

import HealthMemberPanel, { unicodeScalarLength } from './health-member-panel';

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

function defaultAuth(overrides: Partial<ReturnType<typeof useAuth>> = {}): ReturnType<typeof useAuth> {
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

function renderPanel() {
  return render(
    <TenantThemeTestProvider theme={defaultResolvedTheme}>
      <HealthMemberPanel />
    </TenantThemeTestProvider>
  );
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe('unicodeScalarLength', () => {
  it('counts Unicode scalars like Rust chars().count()', () => {
    expect(unicodeScalarLength('Alex')).toBe(4);
    expect(unicodeScalarLength('あ'.repeat(50))).toBe(50);
    expect(unicodeScalarLength('😀'.repeat(100))).toBe(100);
    expect('😀'.repeat(100).length).toBe(200);
  });
});

describe('HealthMemberPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue(defaultAuth());
    mockAuthenticatedFetch.mockResolvedValue(jsonResponse([]));
  });

  it('given no token when rendering then shows sign-in message', () => {
    // Given
    mockUseAuth.mockReturnValue(defaultAuth({ token: null, isAuthenticated: false }));
    // When
    renderPanel();
    // Then
    expect(screen.getByText('Sign in to manage HealthMembers.')).toBeTruthy();
    expect(mockAuthenticatedFetch).not.toHaveBeenCalled();
  });

  it('Scenario: Create from Health screen — Alex appears in active picker', async () => {
    // Given I am on the Health Manager screen (empty list)
    mockAuthenticatedFetch.mockResolvedValueOnce(jsonResponse([]));
    renderPanel();
    await waitFor(() => {
      expect(screen.getByLabelText('Create HealthMember')).toBeTruthy();
    });

    const alex = member({ id: 'm-alex', display_name: 'Alex' });
    mockAuthenticatedFetch
      .mockResolvedValueOnce(jsonResponse(alex, 201))
      .mockResolvedValueOnce(jsonResponse([alex]));

    // When I create HealthMember "Alex"
    fireEvent.press(screen.getByLabelText('Create HealthMember'));
    fireEvent.changeText(screen.getByLabelText('Create display name'), 'Alex');
    fireEvent.press(screen.getByLabelText('Submit create HealthMember'));

    // Then Alex appears in the active picker
    await waitFor(() => {
      expect(screen.getByLabelText('Select HealthMember Alex')).toBeTruthy();
    });
    expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
      '/health-members',
      expect.objectContaining({ method: 'POST' })
    );
    // And I never navigated away (panel stays; create control still present)
    expect(screen.getByLabelText('Create HealthMember')).toBeTruthy();
    expect(screen.queryByText('Documents')).toBeNull();
  });

  it('given empty display name when create submitted then no POST', async () => {
    mockAuthenticatedFetch.mockResolvedValueOnce(jsonResponse([]));
    renderPanel();
    await waitFor(() => {
      expect(screen.getByLabelText('Create HealthMember')).toBeTruthy();
    });
    mockAuthenticatedFetch.mockClear();

    fireEvent.press(screen.getByLabelText('Create HealthMember'));
    fireEvent.press(screen.getByLabelText('Submit create HealthMember'));

    expect(screen.getByText('Display name is required.')).toBeTruthy();
    expect(mockAuthenticatedFetch).not.toHaveBeenCalledWith(
      '/health-members',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('given 100 emoji display name when create submitted then POSTs', async () => {
    mockAuthenticatedFetch.mockResolvedValueOnce(jsonResponse([]));
    renderPanel();
    await waitFor(() => {
      expect(screen.getByLabelText('Create HealthMember')).toBeTruthy();
    });

    const name = '😀'.repeat(100);
    const created = member({ id: 'm-emoji', display_name: name });
    mockAuthenticatedFetch
      .mockResolvedValueOnce(jsonResponse(created, 201))
      .mockResolvedValueOnce(jsonResponse([created]));

    fireEvent.press(screen.getByLabelText('Create HealthMember'));
    fireEvent.changeText(screen.getByLabelText('Create display name'), name);
    fireEvent.press(screen.getByLabelText('Submit create HealthMember'));

    await waitFor(() => {
      expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
        '/health-members',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  it('Scenario: Update from Health screen — picker and header show the new name', async () => {
    // Given HealthMember M is selected
    const before = member({ id: 'm1', display_name: 'Morgan' });
    const after = member({ id: 'm1', display_name: 'Morgan Lee' });
    mockAuthenticatedFetch.mockResolvedValueOnce(jsonResponse([before]));
    renderPanel();
    await waitFor(() => {
      expect(screen.getByLabelText('Select HealthMember Morgan')).toBeTruthy();
    });
    fireEvent.press(screen.getByLabelText('Select HealthMember Morgan'));
    expect(screen.getByLabelText('Selected HealthMember Morgan')).toBeTruthy();
    expect(screen.getByText('Selected: Morgan')).toBeTruthy();

    mockAuthenticatedFetch
      .mockResolvedValueOnce(jsonResponse(after))
      .mockResolvedValueOnce(jsonResponse([after]));

    // When I change M’s display_name and save
    fireEvent.press(screen.getByLabelText('Edit HealthMember'));
    fireEvent.changeText(screen.getByLabelText('Edit display name'), 'Morgan Lee');
    fireEvent.press(screen.getByLabelText('Save HealthMember'));

    // Then the picker and header show the new name
    await waitFor(() => {
      expect(screen.getByLabelText('Select HealthMember Morgan Lee')).toBeTruthy();
    });
    expect(screen.getByLabelText('Selected HealthMember Morgan Lee')).toBeTruthy();
    expect(screen.getByText('Selected: Morgan Lee')).toBeTruthy();
    expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
      '/health-members/m1',
      expect.objectContaining({ method: 'PUT' })
    );
  });

  it('Scenario: Selected member uses shared selected styles', async () => {
    // Given two HealthMembers exist
    const alex = member({ id: 'm1', display_name: 'Alex' });
    const sam = member({ id: 'm2', display_name: 'Sam' });
    mockAuthenticatedFetch.mockResolvedValueOnce(jsonResponse([alex, sam]));
    renderPanel();
    await waitFor(() => {
      expect(screen.getByLabelText('Select HealthMember Alex')).toBeTruthy();
    });

    // When I select Alex
    fireEvent.press(screen.getByLabelText('Select HealthMember Alex'));

    // Then Alex is selected and Sam is not
    const selectedChip = screen.getByLabelText('Select HealthMember Alex');
    const unselectedChip = screen.getByLabelText('Select HealthMember Sam');
    expect(selectedChip.props.accessibilityState).toMatchObject({ selected: true });
    expect(unselectedChip.props.accessibilityState).toMatchObject({
      selected: false,
    });
    expect(selectedChip.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ borderLeftWidth: 4 }),
      ])
    );
    expect(screen.getByText('Selected: Alex')).toBeTruthy();
  });

  it('Scenario: Deactivate with confirm — M leaves default active picker; selection cleared', async () => {
    // Given active HealthMember M is listed and selected
    const m = member({ id: 'm-dep', display_name: 'M' });
    mockAuthenticatedFetch.mockResolvedValueOnce(jsonResponse([m]));
    renderPanel();
    await waitFor(() => {
      expect(screen.getByLabelText('Select HealthMember M')).toBeTruthy();
    });
    fireEvent.press(screen.getByLabelText('Select HealthMember M'));

    mockAuthenticatedFetch
      .mockResolvedValueOnce(jsonResponse({ ...m, active: false }, 200))
      .mockResolvedValueOnce(jsonResponse([]));

    // When I choose deactivate and confirm
    fireEvent.press(screen.getByLabelText('Deactivate HealthMember'));
    expect(screen.getByText('Deactivate HealthMember?')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Deactivate'));

    // Then M is no longer in the default active picker
    await waitFor(() => {
      expect(screen.queryByLabelText('Select HealthMember M')).toBeNull();
    });
    // And if M was selected, selection is cleared
    expect(
      screen.getByLabelText(
        'No HealthMember selected. Create a HealthMember to manage vitals and visits.'
      )
    ).toBeTruthy();
    expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
      '/health-members/m-dep/deactivate',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('Scenario: Cancel deactivate — M stays active', async () => {
    // Given I open deactivate confirm for M
    const m = member({ id: 'm-stay', display_name: 'M' });
    mockAuthenticatedFetch.mockResolvedValueOnce(jsonResponse([m]));
    renderPanel();
    await waitFor(() => {
      expect(screen.getByLabelText('Select HealthMember M')).toBeTruthy();
    });
    fireEvent.press(screen.getByLabelText('Select HealthMember M'));
    fireEvent.press(screen.getByLabelText('Deactivate HealthMember'));
    expect(screen.getByText('Deactivate HealthMember?')).toBeTruthy();

    const callsBeforeCancel = mockAuthenticatedFetch.mock.calls.length;

    // When I cancel
    fireEvent.press(screen.getByLabelText('Cancel'));

    // Then M stays active
    expect(screen.getByLabelText('Select HealthMember M')).toBeTruthy();
    expect(screen.queryByText('Deactivate HealthMember?')).toBeNull();
    expect(mockAuthenticatedFetch.mock.calls.length).toBe(callsBeforeCancel);
    expect(mockAuthenticatedFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/deactivate'),
      expect.anything()
    );
  });

  it('Scenario: Reactivate — inactive M appears in active picker again', async () => {
    // Given inactive M is shown via include-inactive
    const inactive = member({
      id: 'm-re',
      display_name: 'M',
      active: false,
      deactivated_at: '2026-02-01T00:00:00Z',
    });
    const activeAgain = member({ id: 'm-re', display_name: 'M', active: true });

    mockAuthenticatedFetch.mockResolvedValueOnce(jsonResponse([]));
    renderPanel();
    await waitFor(() => {
      expect(screen.getByLabelText('Include inactive HealthMembers')).toBeTruthy();
    });

    mockAuthenticatedFetch.mockResolvedValueOnce(jsonResponse([inactive]));
    fireEvent(screen.getByLabelText('Include inactive HealthMembers'), 'valueChange', true);

    await waitFor(() => {
      expect(screen.getByLabelText('Select inactive HealthMember M')).toBeTruthy();
    });
    fireEvent.press(screen.getByLabelText('Select inactive HealthMember M'));

    mockAuthenticatedFetch
      .mockResolvedValueOnce(jsonResponse(activeAgain))
      .mockResolvedValueOnce(jsonResponse([activeAgain]));

    // When I reactivate M
    fireEvent.press(screen.getByLabelText('Reactivate HealthMember'));

    // Then M appears in the active picker again
    await waitFor(() => {
      expect(screen.getByLabelText('Select HealthMember M')).toBeTruthy();
    });
    expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
      '/health-members/m-re',
      expect.objectContaining({ method: 'PUT' })
    );
    const putCall = mockAuthenticatedFetch.mock.calls.find(
      (call) => call[0] === '/health-members/m-re' && call[1]?.method === 'PUT'
    );
    expect(putCall?.[1]?.body).toBe(
      JSON.stringify({ display_name: 'M', active: true })
    );
  });

  it('given API create error when submitting then keeps form open with message', async () => {
    mockAuthenticatedFetch.mockResolvedValueOnce(jsonResponse([]));
    renderPanel();
    await waitFor(() => {
      expect(screen.getByLabelText('Create HealthMember')).toBeTruthy();
    });

    mockAuthenticatedFetch.mockResolvedValueOnce(
      jsonResponse({ error: 'boom' }, 500)
    );

    fireEvent.press(screen.getByLabelText('Create HealthMember'));
    fireEvent.changeText(screen.getByLabelText('Create display name'), 'Alex');
    fireEvent.press(screen.getByLabelText('Submit create HealthMember'));

    await waitFor(() => {
      expect(screen.getByText(/Request failed \(500\)/)).toBeTruthy();
    });
    expect(screen.getByLabelText('Create display name')).toBeTruthy();
  });
});
