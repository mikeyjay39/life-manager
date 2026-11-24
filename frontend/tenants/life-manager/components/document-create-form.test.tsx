import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import DocumentCreateForm from './document-create-form';
import { useAuth } from '@/contexts/AuthContext';
import { useProtonConnect } from '@/contexts/ProtonConnectContext';
import { apiFetch } from '@/lib/api/client';
import type { CreateDocumentCommand, DocumentDto } from '@/lib/api/types';
import * as loadProton from '@/lib/proton-drive/load-proton.web';
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

vi.mock('@/lib/proton-drive/load-proton.web', () => ({
  uploadToLifeManagerFolder: vi.fn(),
}));

const mockUseAuth = vi.mocked(useAuth);
const mockUseProtonConnect = vi.mocked(useProtonConnect);
const mockApiFetch = vi.mocked(apiFetch);
const mockGetDocumentAsync = vi.mocked(DocumentPicker.getDocumentAsync);
const mockUploadToLifeManagerFolder = vi.mocked(loadProton.uploadToLifeManagerFolder);
const originalPlatformOs = Object.getOwnPropertyDescriptor(Platform, 'OS');

function renderDocumentCreateForm(
  props: {
    onDocumentCreated?: (document: DocumentDto) => void;
    initialTitle?: string;
    initialTags?: string;
  } = {}
) {
  return render(
    <TenantThemeTestProvider theme={defaultResolvedTheme}>
      <DocumentCreateForm {...props} />
    </TenantThemeTestProvider>
  );
}

const createdDto = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  title: 'My Title',
};

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

  it('shows inline form fields when mounted', () => {
    // Given the create form is expanded by the parent
    // When it mounts
    renderDocumentCreateForm();
    // Then fields are visible for submit
    expect(screen.getByLabelText('Document create form')).toBeTruthy();
    expect(screen.getByPlaceholderText('Document title')).toBeTruthy();
    expect(screen.getByPlaceholderText('Document content')).toBeTruthy();
    expect(screen.getByLabelText('Submit')).toBeTruthy();
  });

  it('prefills editable title and tags from initial props', async () => {
    renderDocumentCreateForm({
      initialTitle: 'Daily insurance',
      initialTags: 'insurance',
    });
    expect(screen.getByPlaceholderText('Document title').props.value).toBe(
      'Daily insurance'
    );
    expect(screen.getByPlaceholderText('e.g. work, notes').props.value).toBe(
      'insurance'
    );

    fireEvent.changeText(
      screen.getByPlaceholderText('Document title'),
      'Daily insurance card'
    );
    fireEvent.changeText(screen.getByPlaceholderText('Document content'), 'body');
    submitForm();
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalled();
    });
    expect(getSubmittedPayloadJson()).toMatchObject({
      title: 'Daily insurance card',
      tags: ['insurance'],
    });
  });

  it('shows inline error when there is no token', () => {
    mockUseAuth.mockReturnValue(defaultAuth({ token: null, isAuthenticated: false }));
    renderDocumentCreateForm();
    submitForm();
    expect(screen.getByText('No authentication token available.')).toBeTruthy();
    expect(screen.getByTestId('manager-feedback-error')).toBeTruthy();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('shows validation error when title or content is missing', () => {
    renderDocumentCreateForm();
    fireEvent.changeText(screen.getByPlaceholderText('Document content'), 'body');
    submitForm();
    expect(screen.getByText('Please enter a title and content.')).toBeTruthy();
    expect(screen.getByTestId('manager-feedback-error')).toBeTruthy();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('submits document with POST and bearer token when valid', async () => {
    renderDocumentCreateForm();
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

  it('shows inline error banner when response is not ok', async () => {
    mockApiFetch.mockResolvedValue(new Response('bad', { status: 400 }));
    renderDocumentCreateForm();
    fillRequiredFields();
    submitForm();
    await waitFor(() => {
      expect(screen.getByText(/Request failed \(400\).*bad/)).toBeTruthy();
    });
    expect(screen.getByTestId('manager-feedback-error')).toBeTruthy();
  });

  it('given API failure when submitting then shows inline error in the form', async () => {
    // Given
    mockApiFetch.mockResolvedValue(new Response('upload rejected', { status: 500 }));
    renderDocumentCreateForm();
    fillRequiredFields();

    // When
    submitForm();

    // Then
    await waitFor(() => {
      expect(screen.getByText(/Request failed \(500\).*upload rejected/)).toBeTruthy();
    });
    expect(screen.getByLabelText('Dismiss feedback')).toBeTruthy();
    expect(screen.getByPlaceholderText('Document title')).toBeTruthy();
  });

  it('given network failure when submitting then shows inline error in the form', async () => {
    // Given
    mockApiFetch.mockRejectedValue(new Error('Network request failed'));
    renderDocumentCreateForm();
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
    fillRequiredFields();
    submitForm();
    await waitFor(() => {
      expect(screen.getByText(/Request failed \(400\)/)).toBeTruthy();
    });

    // When
    fireEvent.press(screen.getByLabelText('Dismiss feedback'));

    // Then
    expect(screen.queryByText(/Request failed \(400\)/)).toBeNull();
    expect(screen.queryByLabelText('Dismiss feedback')).toBeNull();
  });

  it('given inline error when user submits again then previous error clears before result', async () => {
    // Given
    mockApiFetch.mockResolvedValueOnce(new Response('first fail', { status: 400 }));
    renderDocumentCreateForm();
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

    // Then — fields reset after success
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Document title').props.value).toBe('');
    });
    expect(screen.queryByText(/first fail/)).toBeNull();
  });

  it('passes created DocumentDto with id and title when create succeeds', async () => {
    // Given
    const onDocumentCreated = vi.fn();
    renderDocumentCreateForm({ onDocumentCreated });
    fillRequiredFields();
    // When
    submitForm();
    // Then
    await waitFor(() => {
      expect(onDocumentCreated).toHaveBeenCalledTimes(1);
    });
    const arg = onDocumentCreated.mock.calls[0][0] as DocumentDto;
    expect(arg.id).toBe(createdDto.id);
    expect(arg.title).toBe(createdDto.title);
  });

  it('resets fields after a successful submit', async () => {
    renderDocumentCreateForm();
    fillRequiredFields();
    submitForm();
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Document title').props.value).toBe('');
    });
    expect(screen.getByPlaceholderText('Document content').props.value).toBe('');
  });

  it('calls onDocumentCreated once when create succeeds', async () => {
    const onDocumentCreated = vi.fn();
    renderDocumentCreateForm({ onDocumentCreated });
    fillRequiredFields();
    submitForm();
    await waitFor(() => {
      expect(onDocumentCreated).toHaveBeenCalledTimes(1);
    });
  });

  it('does not call onDocumentCreated on validation error', () => {
    const onDocumentCreated = vi.fn();
    renderDocumentCreateForm({ onDocumentCreated });
    fireEvent.changeText(screen.getByPlaceholderText('Document content'), 'body');
    submitForm();
    expect(screen.getByText('Please enter a title and content.')).toBeTruthy();
    expect(onDocumentCreated).not.toHaveBeenCalled();
  });

  it('does not call onDocumentCreated when API returns error', async () => {
    const onDocumentCreated = vi.fn();
    mockApiFetch.mockResolvedValue(new Response('bad', { status: 400 }));
    renderDocumentCreateForm({ onDocumentCreated });
    fillRequiredFields();
    submitForm();
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalled();
    });
    expect(onDocumentCreated).not.toHaveBeenCalled();
    expect(screen.getByTestId('manager-feedback-error')).toBeTruthy();
    expect(screen.getByPlaceholderText('Document title')).toBeTruthy();
  });

  it('does not invent an id when response body cannot be parsed', async () => {
    // Given
    const onDocumentCreated = vi.fn();
    mockApiFetch.mockResolvedValue(new Response('not-json', { status: 201 }));
    renderDocumentCreateForm({ onDocumentCreated });
    fillRequiredFields();
    // When
    submitForm();
    // Then
    await waitFor(() => {
      expect(screen.getByText(/response could not be read/i)).toBeTruthy();
    });
    expect(onDocumentCreated).not.toHaveBeenCalled();
  });

  it('does not invent an id when response omits id', async () => {
    const onDocumentCreated = vi.fn();
    mockApiFetch.mockResolvedValue(
      new Response(JSON.stringify({ title: 'No Id' }), { status: 201 })
    );
    renderDocumentCreateForm({ onDocumentCreated });
    fillRequiredFields();
    submitForm();
    await waitFor(() => {
      expect(screen.getByText(/response could not be read/i)).toBeTruthy();
    });
    expect(onDocumentCreated).not.toHaveBeenCalled();
  });

  it('does not call onDocumentCreated after unmount mid-request', async () => {
    // Given a slow create request
    let resolveResponse!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    mockApiFetch.mockReturnValue(pending);
    const onDocumentCreated = vi.fn();
    const { unmount } = renderDocumentCreateForm({ onDocumentCreated });
    fillRequiredFields();
    submitForm();
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalled();
    });

    // When the form unmounts before the response returns
    unmount();
    resolveResponse(
      new Response(JSON.stringify(createdDto), { status: 201 })
    );
    // Let the in-flight promise settle after unmount
    await Promise.resolve();
    await Promise.resolve();

    // Then the parent callback does not run
    expect(onDocumentCreated).not.toHaveBeenCalled();
  });

  it('submits null dates when issue and expire fields are empty', async () => {
    renderDocumentCreateForm();
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

describe('DocumentCreateForm draft mode', () => {
  const draftFile = new File(['policy'], 'policy.pdf', { type: 'application/pdf' });
  const draftAsset = {
    name: 'policy.pdf',
    uri: 'blob:policy',
    mimeType: 'application/pdf',
    file: draftFile,
  } as DocumentPicker.DocumentPickerAsset;

  function renderDraftForm(onDraft: (draft: CreateDocumentCommand) => void | Promise<void>) {
    return render(
      <TenantThemeTestProvider theme={defaultResolvedTheme}>
        <DocumentCreateForm onDraft={onDraft} />
      </TenantThemeTestProvider>
    );
  }

  function useWebWithProtonSession() {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'web' });
    mockUseProtonConnect.mockReturnValue({
      isSupported: true,
      session: {} as ReturnType<typeof useProtonConnect>['session'],
      isConnecting: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
    } as ReturnType<typeof useProtonConnect>);
  }

  async function pickDraftFile() {
    mockGetDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [draftAsset],
    } as Awaited<ReturnType<typeof DocumentPicker.getDocumentAsync>>);
    fireEvent.press(screen.getByLabelText('Choose file'));
    await waitFor(() => {
      expect(screen.getByText('policy.pdf')).toBeTruthy();
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue(defaultAuth());
    mockUploadToLifeManagerFolder.mockResolvedValue({
      provider: 'proton_drive',
      shareId: 'share-1',
      nodeId: 'node-1',
      filename: 'policy.pdf',
      mimeType: 'application/pdf',
    });
  });

  afterEach(() => {
    if (originalPlatformOs) {
      Object.defineProperty(Platform, 'OS', originalPlatformOs);
    }
    mockUseProtonConnect.mockReturnValue({
      isSupported: false,
      session: null,
      isConnecting: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
    } as ReturnType<typeof useProtonConnect>);
  });

  it('given valid fields when submitted then gives the payload to onDraft and sends no request', async () => {
    // Given a draft-mode form with valid fields
    const onDraft = vi.fn();
    renderDraftForm(onDraft);
    fillRequiredFields();
    fireEvent.changeText(screen.getByPlaceholderText('e.g. work, notes'), 'car, insurance');
    // When the user submits
    submitForm();
    // Then the parent gets the payload with no file and no POST /documents
    await waitFor(() => {
      expect(onDraft).toHaveBeenCalledTimes(1);
    });
    expect(onDraft).toHaveBeenCalledWith({
      title: 'Hello',
      content: 'World',
      tags: ['car', 'insurance'],
      issued_date: null,
      expire_date: null,
      storage: null,
    });
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Document title').props.value).toBe('');
  });

  it('given no Proton session when shown then hides the file pick and shows a hint', () => {
    // Given a draft-mode form without a Proton session
    // When it mounts
    renderDraftForm(vi.fn());
    // Then no device file can be picked
    expect(screen.queryByLabelText('Choose file')).toBeNull();
    expect(screen.getByText('To attach a file, connect Proton Drive on web.')).toBeTruthy();
  });

  it('given invalid fields when submitted then does not call onDraft', () => {
    // Given a draft-mode form with no content
    const onDraft = vi.fn();
    renderDraftForm(onDraft);
    fireEvent.changeText(screen.getByPlaceholderText('Document title'), 'Hello');
    // When the user submits
    submitForm();
    // Then the form shows the error and keeps the draft local
    expect(screen.getByText('Please enter a title and content.')).toBeTruthy();
    expect(onDraft).not.toHaveBeenCalled();
  });

  it('given web with Proton and a file when submitted then uploads once and sends storage in the draft', async () => {
    // Given web with a Proton session and a picked file
    useWebWithProtonSession();
    const onDraft = vi.fn();
    renderDraftForm(onDraft);
    fillRequiredFields();
    await pickDraftFile();
    // When the user submits
    submitForm();
    // Then the file goes to Proton and the draft holds its reference
    await waitFor(() => {
      expect(onDraft).toHaveBeenCalledTimes(1);
    });
    expect(mockUploadToLifeManagerFolder).toHaveBeenCalledTimes(1);
    expect(onDraft.mock.calls[0][0].storage).toEqual({
      provider: 'proton_drive',
      share_id: 'share-1',
      node_id: 'node-1',
      filename: 'policy.pdf',
      mime_type: 'application/pdf',
    });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('given onDraft rejects when submitted again then keeps the values and reuses the upload', async () => {
    // Given the parent write fails once
    useWebWithProtonSession();
    const onDraft = vi
      .fn()
      .mockRejectedValueOnce(new Error('Request failed (409): duplicate VIN'))
      .mockResolvedValueOnce(undefined);
    renderDraftForm(onDraft);
    fillRequiredFields();
    await pickDraftFile();
    // When the user submits
    submitForm();
    // Then the form shows the error and keeps its values
    await waitFor(() => {
      expect(screen.getByText('Request failed (409): duplicate VIN')).toBeTruthy();
    });
    expect(screen.getByPlaceholderText('Document title').props.value).toBe('Hello');
    expect(screen.getByText('policy.pdf')).toBeTruthy();
    // When the user submits again
    submitForm();
    // Then the same Proton file is sent with no second upload
    await waitFor(() => {
      expect(onDraft).toHaveBeenCalledTimes(2);
    });
    expect(mockUploadToLifeManagerFolder).toHaveBeenCalledTimes(1);
    expect(onDraft.mock.calls[1][0].storage).toEqual(onDraft.mock.calls[0][0].storage);
  });

  it('given onDraft is pending when shown then the form reports that it submits', async () => {
    // Given a parent write that does not finish yet
    let finishDraft: () => void = () => {};
    const onDraft = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishDraft = resolve;
        })
    );
    const onSubmittingChange = vi.fn();
    render(
      <TenantThemeTestProvider theme={defaultResolvedTheme}>
        <DocumentCreateForm onDraft={onDraft} onSubmittingChange={onSubmittingChange} />
      </TenantThemeTestProvider>
    );
    fillRequiredFields();
    // When the user submits
    submitForm();
    // Then the parent sees the busy state until the write settles
    await waitFor(() => {
      expect(onSubmittingChange).toHaveBeenLastCalledWith(true);
    });
    finishDraft();
    await waitFor(() => {
      expect(onSubmittingChange).toHaveBeenLastCalledWith(false);
    });
  });
});
