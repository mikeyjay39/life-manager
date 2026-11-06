import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import DocumentCreateForm from './document-create-form';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api/client';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';

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

vi.mock('@/contexts/ProtonConnectContext', () => ({
  useProtonConnect: vi.fn(() => ({
    isSupported: false,
    session: null,
    isConnecting: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
  })),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>();
  return {
    ...actual,
    apiFetch: vi.fn(),
  };
});

vi.mock('expo-document-picker', () => ({
  getDocumentAsync: vi.fn().mockResolvedValue({ canceled: true, assets: [] }),
}));

const mockUseAuth = vi.mocked(useAuth);
const mockApiFetch = vi.mocked(apiFetch);

function renderDocumentCreateForm(props: { onDocumentCreated?: () => void } = {}) {
  return render(
    <TenantThemeTestProvider theme={defaultResolvedTheme}>
      <DocumentCreateForm {...props} />
    </TenantThemeTestProvider>
  );
}

function defaultAuth(overrides: Partial<ReturnType<typeof useAuth>> = {}): ReturnType<typeof useAuth> {
  return {
    token: 'test-token',
    handleUnauthorized: vi.fn(),
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useAuth>;
}

function openCreateModal() {
  fireEvent.press(screen.getByLabelText('Create document'));
}

function submitForm() {
  fireEvent.press(screen.getByLabelText('Submit'));
}

function getSubmittedPayloadJson(): Record<string, unknown> {
  const call = mockApiFetch.mock.calls[0];
  const body = call[1]?.body;
  if (!(body instanceof FormData)) {
    throw new Error('Expected FormData body');
  }
  const jsonPart = body.get('json');
  if (typeof jsonPart !== 'string') {
    throw new Error('Expected json string in FormData');
  }
  return JSON.parse(jsonPart) as Record<string, unknown>;
}

function fillRequiredFields() {
  fireEvent.changeText(screen.getByPlaceholderText('Document title'), 'Hello');
  fireEvent.changeText(screen.getByPlaceholderText('Document content'), 'World');
}

describe('DocumentCreateForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue(defaultAuth());
    mockApiFetch.mockResolvedValue(
      new Response(JSON.stringify({ id: '550e8400-e29b-41d4-a716-446655440000', title: 'My Title' }), {
        status: 201,
      })
    );
  });

  it('does not show form fields until the modal is opened', () => {
    renderDocumentCreateForm();
    expect(screen.queryByPlaceholderText('Document title')).toBeNull();
    openCreateModal();
    expect(screen.getByPlaceholderText('Document title')).toBeTruthy();
  });

  it('closes the modal on Cancel without submitting', () => {
    renderDocumentCreateForm();
    openCreateModal();
    fillRequiredFields();
    fireEvent.press(screen.getByLabelText('Cancel'));
    expect(screen.queryByPlaceholderText('Document title')).toBeNull();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('shows error alert when there is no token', () => {
    const alertSpy = vi.spyOn(Alert, 'alert');
    mockUseAuth.mockReturnValue(defaultAuth({ token: null, isAuthenticated: false }));
    renderDocumentCreateForm();
    openCreateModal();
    submitForm();
    expect(alertSpy).toHaveBeenCalledWith('Error', 'No authentication token available.');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('shows validation alert when title or content is missing', () => {
    const alertSpy = vi.spyOn(Alert, 'alert');
    renderDocumentCreateForm();
    openCreateModal();
    fireEvent.changeText(screen.getByPlaceholderText('Document content'), 'body');
    submitForm();
    expect(alertSpy).toHaveBeenCalledWith('Error', 'Please enter a title and content.');
    expect(screen.getByText('Please enter a title and content.')).toBeTruthy();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('submits document with POST and bearer token when valid', async () => {
    renderDocumentCreateForm();
    openCreateModal();
    fillRequiredFields();
    submitForm();
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalled();
    });
    const call = mockApiFetch.mock.calls[0];
    expect(call[0]).toBe('/documents');
    expect(call[1]).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer test-token' },
    });
  });

  it('shows error alert when response is not ok', async () => {
    const alertSpy = vi.spyOn(Alert, 'alert');
    mockApiFetch.mockResolvedValue(new Response('bad', { status: 400 }));
    renderDocumentCreateForm();
    openCreateModal();
    fillRequiredFields();
    submitForm();
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Error', expect.stringContaining('400'));
    });
  });

  it('given API failure when submitting then shows inline error in the form', async () => {
    // Given
    mockApiFetch.mockResolvedValue(new Response('upload rejected', { status: 500 }));
    renderDocumentCreateForm();
    openCreateModal();
    fillRequiredFields();

    // When
    submitForm();

    // Then
    await waitFor(() => {
      expect(screen.getByText(/Request failed \(500\).*upload rejected/)).toBeTruthy();
    });
    expect(screen.getByLabelText('Dismiss error')).toBeTruthy();
    expect(screen.getByPlaceholderText('Document title')).toBeTruthy();
  });

  it('given network failure when submitting then shows inline error in the form', async () => {
    // Given
    mockApiFetch.mockRejectedValue(new Error('Network request failed'));
    renderDocumentCreateForm();
    openCreateModal();
    fillRequiredFields();

    // When
    submitForm();

    // Then
    await waitFor(() => {
      expect(screen.getByText('Network request failed')).toBeTruthy();
    });
  });

  it('given inline error when user dismisses then error is hidden', async () => {
    // Given
    mockApiFetch.mockResolvedValue(new Response('bad', { status: 400 }));
    renderDocumentCreateForm();
    openCreateModal();
    fillRequiredFields();
    submitForm();
    await waitFor(() => {
      expect(screen.getByText(/Request failed \(400\)/)).toBeTruthy();
    });

    // When
    fireEvent.press(screen.getByLabelText('Dismiss error'));

    // Then
    expect(screen.queryByText(/Request failed \(400\)/)).toBeNull();
    expect(screen.queryByLabelText('Dismiss error')).toBeNull();
  });

  it('given inline error when user submits again then previous error clears before result', async () => {
    // Given
    mockApiFetch.mockResolvedValueOnce(new Response('first fail', { status: 400 }));
    renderDocumentCreateForm();
    openCreateModal();
    fillRequiredFields();
    submitForm();
    await waitFor(() => {
      expect(screen.getByText(/first fail/)).toBeTruthy();
    });

    // When — second submit succeeds
    mockApiFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: '550e8400-e29b-41d4-a716-446655440000', title: 'Hello' }), {
        status: 201,
      })
    );
    submitForm();

    // Then — modal closes (success clears error)
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Document title')).toBeNull();
    });
    expect(screen.queryByText(/first fail/)).toBeNull();
  });

  it('shows success alert with id when response contains id', async () => {
    const alertSpy = vi.spyOn(Alert, 'alert');
    renderDocumentCreateForm();
    openCreateModal();
    fillRequiredFields();
    submitForm();
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Success',
        expect.stringContaining('550e8400-e29b-41d4-a716-446655440000')
      );
    });
  });

  it('closes the modal after a successful submit', async () => {
    renderDocumentCreateForm();
    openCreateModal();
    fillRequiredFields();
    submitForm();
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalled();
    });
    expect(screen.queryByPlaceholderText('Document title')).toBeNull();
  });

  it('calls onDocumentCreated once when create succeeds', async () => {
    const onDocumentCreated = vi.fn();
    renderDocumentCreateForm({ onDocumentCreated });
    openCreateModal();
    fillRequiredFields();
    submitForm();
    await waitFor(() => {
      expect(onDocumentCreated).toHaveBeenCalledTimes(1);
    });
  });

  it('does not call onDocumentCreated on validation error', () => {
    const onDocumentCreated = vi.fn();
    const alertSpy = vi.spyOn(Alert, 'alert');
    renderDocumentCreateForm({ onDocumentCreated });
    openCreateModal();
    fireEvent.changeText(screen.getByPlaceholderText('Document content'), 'body');
    submitForm();
    expect(alertSpy).toHaveBeenCalledWith('Error', 'Please enter a title and content.');
    expect(onDocumentCreated).not.toHaveBeenCalled();
  });

  it('does not call onDocumentCreated when API returns error', async () => {
    const onDocumentCreated = vi.fn();
    mockApiFetch.mockResolvedValue(new Response('bad', { status: 400 }));
    renderDocumentCreateForm({ onDocumentCreated });
    openCreateModal();
    fillRequiredFields();
    submitForm();
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalled();
    });
    expect(onDocumentCreated).not.toHaveBeenCalled();
  });

  it('submits null dates when issue and expire fields are empty', async () => {
    renderDocumentCreateForm();
    openCreateModal();
    fillRequiredFields();
    submitForm();
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalled();
    });
    const payload = getSubmittedPayloadJson();
    expect(payload.issued_date).toBeNull();
    expect(payload.expire_date).toBeNull();
  });

  it('given picked issue and expire dates when submitted then sends API datetime format', async () => {
    // Given
    renderDocumentCreateForm();
    openCreateModal();
    fillRequiredFields();
    // When — pick via DatePicker (mocked community picker confirms 2024-06-01)
    fireEvent.press(screen.getByLabelText('Issue date'));
    fireEvent.press(screen.getByLabelText('Confirm picked date'));
    fireEvent.press(screen.getByLabelText('Expire date'));
    fireEvent.press(screen.getByLabelText('Confirm picked date'));
    submitForm();
    // Then
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalled();
    });
    const payload = getSubmittedPayloadJson();
    expect(payload.issued_date).toBe('2024-06-01T00:00:00');
    expect(payload.expire_date).toBe('2024-06-01T00:00:00');
  });

  it('given a picked issue date when cleared then submits null issued_date', async () => {
    // Given
    renderDocumentCreateForm();
    openCreateModal();
    fillRequiredFields();
    fireEvent.press(screen.getByLabelText('Issue date'));
    fireEvent.press(screen.getByLabelText('Confirm picked date'));
    // When
    fireEvent.press(screen.getByLabelText('Clear Issue date'));
    submitForm();
    // Then
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalled();
    });
    const payload = getSubmittedPayloadJson();
    expect(payload.issued_date).toBeNull();
    expect(payload.expire_date).toBeNull();
  });
});
