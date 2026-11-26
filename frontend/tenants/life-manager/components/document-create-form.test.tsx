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

type RouteHandler = () => Response | Promise<Response>;

const emptyExtraction = {
  title: null,
  content: null,
  tags: [],
  issued_date: null,
  expire_date: null,
};

const defaultLimits = {
  daily_limit_per_user: 20,
  remaining_today: 5,
  max_file_bytes: 10485760,
  max_pdf_pages: 5,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/** Routes `apiFetch` by path: the form reads the limits on mount. */
function mockApiRoutes(
  routes: { limits?: RouteHandler; extract?: RouteHandler; create?: RouteHandler } = {}
) {
  const limits = routes.limits ?? (() => jsonResponse(defaultLimits));
  const extract =
    routes.extract ?? (() => jsonResponse(emptyExtraction));
  const create = routes.create ?? (() => jsonResponse(createdDto, 201));
  mockApiFetch.mockImplementation(async (path) => {
    if (path === '/documents/extract/limits') {
      return limits();
    }
    if (path === '/documents/extract') {
      return extract();
    }
    return create();
  });
}

function callsTo(path: string) {
  return mockApiFetch.mock.calls.filter(([calledPath]) => calledPath === path);
}

function createCalls() {
  return mockApiFetch.mock.calls.filter(([path]) =>
    ['/documents', '/documents/json'].includes(path)
  );
}

function submitForm() {
  fireEvent.press(screen.getByLabelText('Submit'));
}

function getSubmittedPayloadJson(): Record<string, unknown> {
  const call = createCalls()[0];
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
    mockApiRoutes();
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
      expect(createCalls()).toHaveLength(1);
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
    expect(createCalls()).toHaveLength(0);
  });

  it('shows validation error when title or content is missing', () => {
    renderDocumentCreateForm();
    fireEvent.changeText(screen.getByPlaceholderText('Document content'), 'body');
    submitForm();
    expect(screen.getByText('Please enter a title and content.')).toBeTruthy();
    expect(screen.getByTestId('manager-feedback-error')).toBeTruthy();
    expect(createCalls()).toHaveLength(0);
  });

  it('submits document with POST and bearer token when valid', async () => {
    renderDocumentCreateForm();
    fillRequiredFields();
    submitForm();
    await waitFor(() => {
      expect(createCalls()).toHaveLength(1);
    });
    const call = createCalls()[0];
    expect(call[0]).toBe('/documents');
    expect(call[1]).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer test-token' },
    });
  });

  it('shows inline error banner when response is not ok', async () => {
    mockApiRoutes({ create: () => new Response('bad', { status: 400 }) });
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
    mockApiRoutes({ create: () => new Response('upload rejected', { status: 500 }) });
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
    mockApiRoutes({ create: () => Promise.reject(new Error('Network request failed')) });
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
    mockApiRoutes({ create: () => new Response('bad', { status: 400 }) });
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
    const createResponses = [
      new Response('first fail', { status: 400 }),
      jsonResponse({ id: '550e8400-e29b-41d4-a716-446655440000', title: 'Hello' }, 201),
    ];
    mockApiRoutes({ create: () => createResponses.shift() as Response });
    renderDocumentCreateForm();
    fillRequiredFields();
    submitForm();
    await waitFor(() => {
      expect(screen.getByText(/first fail/)).toBeTruthy();
    });

    // When — second submit succeeds
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
      expect(createCalls()).toHaveLength(1);
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
    mockApiRoutes({ create: () => new Response('bad', { status: 400 }) });
    renderDocumentCreateForm({ onDocumentCreated });
    fillRequiredFields();
    submitForm();
    await waitFor(() => {
      expect(createCalls()).toHaveLength(1);
    });
    expect(onDocumentCreated).not.toHaveBeenCalled();
    expect(screen.getByTestId('manager-feedback-error')).toBeTruthy();
    expect(screen.getByPlaceholderText('Document title')).toBeTruthy();
  });

  it('does not invent an id when response body cannot be parsed', async () => {
    // Given
    const onDocumentCreated = vi.fn();
    mockApiRoutes({ create: () => new Response('not-json', { status: 201 }) });
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
    mockApiRoutes({ create: () => jsonResponse({ title: 'No Id' }, 201) });
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
    mockApiRoutes({ create: () => pending });
    const onDocumentCreated = vi.fn();
    const { unmount } = renderDocumentCreateForm({ onDocumentCreated });
    fillRequiredFields();
    submitForm();
    await waitFor(() => {
      expect(createCalls()).toHaveLength(1);
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
      expect(createCalls()).toHaveLength(1);
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
      expect(createCalls()).toHaveLength(1);
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
      expect(createCalls()).toHaveLength(1);
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
    mockApiRoutes();
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
    expect(createCalls()).toHaveLength(0);
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
    expect(createCalls()).toHaveLength(0);
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

describe('DocumentCreateForm extract from file', () => {
  const fullExtraction = {
    title: 'Home insurance',
    content: 'Policy text',
    tags: ['insurance', 'home'],
    issued_date: '2025-01-01',
    expire_date: '2026-01-01',
  };

  function jpegAsset(
    overrides: Partial<DocumentPicker.DocumentPickerAsset> = {}
  ): DocumentPicker.DocumentPickerAsset {
    return {
      name: 'scan.jpg',
      uri: 'file:///cache/scan.jpg',
      mimeType: 'image/jpeg',
      size: 2048,
      lastModified: 0,
      ...overrides,
    } as DocumentPicker.DocumentPickerAsset;
  }

  function pickerReturns(asset: DocumentPicker.DocumentPickerAsset) {
    mockGetDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [asset],
    } as Awaited<ReturnType<typeof DocumentPicker.getDocumentAsync>>);
  }

  function pressExtract() {
    fireEvent.press(screen.getByLabelText('Extract From File'));
  }

  function isDisabled(label: string): boolean {
    return screen.getByLabelText(label).props.accessibilityState?.disabled === true;
  }

  function pendingResponse() {
    let resolve!: (value: Response) => void;
    const promise = new Promise<Response>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  async function waitForLimitsLoaded() {
    await waitFor(() => {
      expect(screen.getByText(/extractions left today/)).toBeTruthy();
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue(defaultAuth());
    mockApiRoutes({ extract: () => jsonResponse(fullExtraction) });
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

  it('given a typed title when the extraction returns all fields then fills the empty fields and keeps the title', async () => {
    // Given the user typed a title only
    renderDocumentCreateForm();
    await waitForLimitsLoaded();
    fireEvent.changeText(screen.getByPlaceholderText('Document title'), 'My policy');
    pickerReturns(jpegAsset());
    // When the extraction returns title, content, tags and both dates
    pressExtract();
    // Then the 4 empty fields fill and the title stays
    await waitFor(() => {
      expect(
        screen.getByText('Filled 4 fields from scan.jpg. Review before you submit.')
      ).toBeTruthy();
    });
    expect(screen.getByPlaceholderText('Document title').props.value).toBe('My policy');
    expect(screen.getByPlaceholderText('Document content').props.value).toBe('Policy text');
    expect(screen.getByPlaceholderText('e.g. work, notes').props.value).toBe(
      'insurance, home'
    );
    expect(screen.getByText('2025-01-01')).toBeTruthy();
    expect(screen.getByText('2026-01-01')).toBeTruthy();
  });

  it('given the extraction returns no usable fields then the banner says no fields were found', async () => {
    // Given an extraction with no usable values
    mockApiRoutes({ extract: () => jsonResponse({ ...emptyExtraction, title: '  ' }) });
    renderDocumentCreateForm();
    pickerReturns(jpegAsset());
    // When the user extracts
    pressExtract();
    // Then the banner reports no fields
    await waitFor(() => {
      expect(screen.getByText('No fields found in scan.jpg.')).toBeTruthy();
    });
    expect(screen.getByPlaceholderText('Document title').props.value).toBe('');
  });

  it('given web with no Proton session when a JPEG is picked then posts it as multipart file and fills the fields', async () => {
    // Given web with no Proton session
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'web' });
    const jpegFile = new File(['jpeg-bytes'], 'scan.jpg', { type: 'image/jpeg' });
    renderDocumentCreateForm();
    pickerReturns(jpegAsset({ uri: 'blob:scan', file: jpegFile }));
    // When the user extracts
    pressExtract();
    // Then POST /documents/extract gets the file and the fields fill
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Document title').props.value).toBe('Home insurance');
    });
    const [extractCall] = callsTo('/documents/extract');
    expect(extractCall[1]).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer test-token' },
    });
    const body = extractCall[1]?.body;
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('file')).toBeInstanceOf(File);
    expect(((body as FormData).get('file') as File).name).toBe('scan.jpg');
  });

  it('given the picker opens then it asks for images and PDFs, and cancel sends no request', async () => {
    // Given the user cancels the picker
    renderDocumentCreateForm();
    await waitForLimitsLoaded();
    mockGetDocumentAsync.mockResolvedValueOnce({ canceled: true, assets: null } as Awaited<
      ReturnType<typeof DocumentPicker.getDocumentAsync>
    >);
    fireEvent.changeText(screen.getByPlaceholderText('Document title'), 'Kept');
    // When the user presses Extract From File
    pressExtract();
    // Then the picker filters to images and PDFs and nothing changes
    await waitFor(() => {
      expect(mockGetDocumentAsync).toHaveBeenCalledWith(
        expect.objectContaining({ type: ['image/*', 'application/pdf'], multiple: false })
      );
    });
    await waitFor(() => {
      expect(isDisabled('Extract From File')).toBe(false);
    });
    expect(callsTo('/documents/extract')).toHaveLength(0);
    expect(screen.getByPlaceholderText('Document title').props.value).toBe('Kept');
    expect(screen.queryByTestId('extract-feedback-error')).toBeNull();
  });

  it('given max_file_bytes 10485760 when a 12 MB file is picked then shows an error and sends no request', async () => {
    // Given the limits allow 10 MB
    renderDocumentCreateForm();
    await waitForLimitsLoaded();
    pickerReturns(jpegAsset({ size: 12 * 1024 * 1024 }));
    // When the user picks a 12 MB file
    pressExtract();
    // Then an error banner shows and no extract request goes out
    await waitFor(() => {
      expect(screen.getByText('scan.jpg is larger than 10 MB.')).toBeTruthy();
    });
    expect(screen.getByTestId('extract-feedback-error')).toBeTruthy();
    expect(callsTo('/documents/extract')).toHaveLength(0);
  });

  it('given remaining_today is 0 then the button is disabled and the form says no extractions are left', async () => {
    // Given no extractions are left today
    mockApiRoutes({ limits: () => jsonResponse({ ...defaultLimits, remaining_today: 0 }) });
    // When the form mounts
    renderDocumentCreateForm();
    // Then the button is disabled with a hint
    await waitFor(() => {
      expect(screen.getByText('No extractions left today')).toBeTruthy();
    });
    expect(isDisabled('Extract From File')).toBe(true);
  });

  it('given the limits request fails then the button stays enabled', async () => {
    // Given the limits request rejects
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockApiRoutes({ limits: () => Promise.reject(new Error('offline')) });
    // When the form mounts
    renderDocumentCreateForm();
    // Then the button stays enabled and shows no limits hint
    await waitFor(() => {
      expect(warn).toHaveBeenCalled();
    });
    expect(isDisabled('Extract From File')).toBe(false);
    expect(screen.queryByText(/extractions left today/)).toBeNull();
    warn.mockRestore();
  });

  it('given an extraction runs then the button is busy, Submit is disabled, fields stay editable, and a second click sends no request', async () => {
    // Given a slow extract request
    const pending = pendingResponse();
    mockApiRoutes({ extract: () => pending.promise });
    renderDocumentCreateForm();
    await waitForLimitsLoaded();
    pickerReturns(jpegAsset());
    pickerReturns(jpegAsset());
    // When the user presses Extract From File twice
    pressExtract();
    pressExtract();
    // Then only one request goes out and the form is busy
    await waitFor(() => {
      expect(callsTo('/documents/extract')).toHaveLength(1);
    });
    expect(screen.getByLabelText('Extract From File').props.accessibilityState?.busy).toBe(true);
    expect(isDisabled('Extract From File')).toBe(true);
    expect(isDisabled('Submit')).toBe(true);
    pressExtract();
    expect(mockGetDocumentAsync).toHaveBeenCalledTimes(1);
    // When the user edits content during the request
    fireEvent.changeText(screen.getByPlaceholderText('Document content'), 'Typed during');
    pending.resolve(jsonResponse(fullExtraction));
    // Then the typed content stays and the busy state ends
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Document title').props.value).toBe('Home insurance');
    });
    expect(screen.getByPlaceholderText('Document content').props.value).toBe('Typed during');
    expect(isDisabled('Submit')).toBe(false);
    expect(callsTo('/documents/extract')).toHaveLength(1);
  });

  it.each([
    [413, 'File is too large for extraction.'],
    [429, 'No extractions left today.'],
    [503, 'Extraction is not available now.'],
  ])('given the backend returns %i then the banner shows its message and values stay', async (status, message) => {
    // Given the backend rejects the extraction
    mockApiRoutes({ extract: () => jsonResponse({ message }, status) });
    renderDocumentCreateForm();
    fireEvent.changeText(screen.getByPlaceholderText('Document title'), 'My policy');
    fireEvent.changeText(screen.getByPlaceholderText('Document content'), 'Body');
    pickerReturns(jpegAsset());
    // When the user extracts
    pressExtract();
    // Then the banner shows the backend message and fields keep their values
    await waitFor(() => {
      expect(screen.getByText(message)).toBeTruthy();
    });
    expect(screen.getByTestId('extract-feedback-error')).toBeTruthy();
    expect(screen.getByPlaceholderText('Document title').props.value).toBe('My policy');
    expect(screen.getByPlaceholderText('Document content').props.value).toBe('Body');
  });

  it('given an extraction then passes handleUnauthorized to apiFetch for a 401', async () => {
    // Given an auth context with a 401 handler
    const handleUnauthorized = vi.fn();
    mockUseAuth.mockReturnValue(defaultAuth({ handleUnauthorized }));
    mockApiRoutes({ extract: () => jsonResponse({ message: 'Unauthorized' }, 401) });
    renderDocumentCreateForm();
    pickerReturns(jpegAsset());
    // When the user extracts
    pressExtract();
    // Then apiFetch gets the handler, which runs on 401
    await waitFor(() => {
      expect(callsTo('/documents/extract')).toHaveLength(1);
    });
    expect(callsTo('/documents/extract')[0][1]?.onUnauthorized).toBe(handleUnauthorized);
  });

  it('given the form unmounts during an extraction when the response arrives then no state update happens', async () => {
    // Given a slow extract request
    const consoleError = vi.spyOn(console, 'error');
    const pending = pendingResponse();
    mockApiRoutes({ extract: () => pending.promise });
    const { unmount } = renderDocumentCreateForm();
    await waitForLimitsLoaded();
    pickerReturns(jpegAsset());
    pressExtract();
    await waitFor(() => {
      expect(callsTo('/documents/extract')).toHaveLength(1);
    });
    const limitsCallsBefore = callsTo('/documents/extract/limits').length;
    // When the form unmounts and the response then arrives
    unmount();
    pending.resolve(jsonResponse(fullExtraction));
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Then nothing logs an error and the limits do not reload
    expect(consoleError).not.toHaveBeenCalled();
    expect(callsTo('/documents/extract/limits')).toHaveLength(limitsCallsBefore);
    consoleError.mockRestore();
  });

  it('given an extraction then the attached file stays empty and the limits reload', async () => {
    // Given no attached file
    renderDocumentCreateForm();
    await waitForLimitsLoaded();
    expect(screen.getByText('No file selected')).toBeTruthy();
    pickerReturns(jpegAsset());
    // When the user extracts
    pressExtract();
    // Then the attach-file slot does not change and the limits load again
    await waitFor(() => {
      expect(screen.getByText(/Filled 5 fields from scan.jpg/)).toBeTruthy();
    });
    expect(screen.getByText('No file selected')).toBeTruthy();
    expect(screen.queryByText('scan.jpg')).toBeNull();
    await waitFor(() => {
      expect(callsTo('/documents/extract/limits')).toHaveLength(2);
    });
  });

  it('given web with a Proton session then the button shows', () => {
    // Given web with a Proton session
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'web' });
    mockUseProtonConnect.mockReturnValue({
      isSupported: true,
      session: {} as ReturnType<typeof useProtonConnect>['session'],
      isConnecting: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
    } as ReturnType<typeof useProtonConnect>);
    // When the form mounts
    renderDocumentCreateForm();
    // Then Extract From File shows
    expect(screen.getByLabelText('Extract From File')).toBeTruthy();
  });

  it('given draft mode when the extraction succeeds then fills the fields and sends no create request', async () => {
    // Given a draft-mode form with no Proton session
    const onDraft = vi.fn();
    render(
      <TenantThemeTestProvider theme={defaultResolvedTheme}>
        <DocumentCreateForm onDraft={onDraft} initialTags="insurance" />
      </TenantThemeTestProvider>
    );
    pickerReturns(jpegAsset());
    // When the user extracts
    pressExtract();
    // Then the fields fill, the prefill tag stays, and no POST /documents goes out
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Document title').props.value).toBe('Home insurance');
    });
    expect(screen.getByPlaceholderText('e.g. work, notes').props.value).toBe(
      'insurance, home'
    );
    expect(createCalls()).toHaveLength(0);
    expect(onDraft).not.toHaveBeenCalled();
  });
});
