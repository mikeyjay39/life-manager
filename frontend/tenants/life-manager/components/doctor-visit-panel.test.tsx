import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { useAuth } from '@/contexts/AuthContext';
import { authenticatedFetch } from '@/lib/api/client';
import type { HealthMemberDto } from '@/lib/api/types';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';

import DoctorVisitPanel from './doctor-visit-panel';

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

const activeMember: HealthMemberDto = {
  id: 'm1',
  display_name: 'Alex',
  birth_date: null,
  notes: null,
  active: true,
  created_at: 't',
  updated_at: 't',
  deactivated_at: null,
};

function renderPanel(member: HealthMemberDto | null = activeMember) {
  return render(
    <TenantThemeTestProvider theme={defaultResolvedTheme}>
      <DoctorVisitPanel selectedMember={member} />
    </TenantThemeTestProvider>
  );
}

describe('DoctorVisitPanel', () => {
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

  it('given no member when render then prompts to select', async () => {
    // Given no selected HealthMember
    renderPanel(null);
    // Then the panel asks the user to select a member
    expect(
      screen.getByLabelText(
        'No HealthMember selected. Choose a HealthMember above to log doctor visits.'
      )
    ).toBeTruthy();
    expect(
      screen.getByText('Choose a HealthMember above to log doctor visits.')
    ).toBeTruthy();
    expect(
      screen.queryByText(/Select or create a HealthMember to log doctor visits/i)
    ).toBeNull();
    await waitFor(() => {
      expect(mockAuthenticatedFetch).not.toHaveBeenCalled();
    });
  });

  it('given active member when submit notes then posts visit and refreshes', async () => {
    // Given list then create then refresh
    mockAuthenticatedFetch
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'v1',
            health_member_id: 'm1',
            visited_on: '2026-01-15',
            provider_name: null,
            reason: null,
            notes: 'checkup',
            created_at: 't',
            updated_at: 't',
          }),
          { status: 201 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 'v1',
              health_member_id: 'm1',
              visited_on: '2026-01-15',
              provider_name: null,
              reason: null,
              notes: 'checkup',
              created_at: 't',
              updated_at: 't',
            },
          ]),
          { status: 200 }
        )
      );

    renderPanel();

    await waitFor(() => {
      expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
        '/doctor-visits?health_member_id=m1',
        expect.objectContaining({ method: 'GET' })
      );
    });

    fireEvent.press(screen.getByLabelText('Add visit'));
    await waitFor(() => {
      expect(screen.getByLabelText('Doctor visit form')).toBeTruthy();
    });
    fireEvent.changeText(screen.getByLabelText('Visit notes'), 'checkup');
    fireEvent.press(screen.getByLabelText('Save visit'));

    await waitFor(() => {
      expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
        '/doctor-visits',
        expect.objectContaining({ method: 'POST' })
      );
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Notes: checkup')).toBeTruthy();
    });
  });

  it('given listed visit when delete confirm then deletes and refreshes', async () => {
    // Given one visit in the list
    mockAuthenticatedFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 'v1',
              health_member_id: 'm1',
              visited_on: '2026-01-15',
              provider_name: 'Dr. Lee',
              reason: null,
              notes: null,
              created_at: 't',
              updated_at: 't',
            },
          ]),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

    renderPanel();

    await waitFor(() => {
      expect(screen.getByLabelText('Provider: Dr. Lee')).toBeTruthy();
    });

    fireEvent.press(screen.getByLabelText('Delete visit on 2026-01-15'));
    fireEvent.press(screen.getByText('Delete'));

    await waitFor(() => {
      expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
        '/doctor-visits/v1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/No visits yet/i)).toBeTruthy();
    });
  });
});
