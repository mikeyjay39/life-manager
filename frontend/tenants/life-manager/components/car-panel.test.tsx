import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { useAuth } from '@/contexts/AuthContext';
import { authenticatedFetch } from '@/lib/api/client';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';
import type { CarDto, CreateDocumentCommand, DocumentDto } from '@/lib/api/types';

import CarPanel, {
  carDisplayLabel,
  carDocumentPrefillTags,
  carDocumentPrefillTitle,
  carFormDraftLabel,
  parseCarDto,
  parseOwnedDocumentDto,
  unicodeScalarLength,
} from './car-panel';

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

const mockDraft = vi.hoisted(() => ({
  storage: null as DocumentDto['storage'],
}));

vi.mock('./document-create-form', () => ({
  default: function MockDocumentCreateForm({
    onDraft,
    initialTitle,
    initialTags,
  }: {
    onDraft?: (draft: CreateDocumentCommand) => void | Promise<void>;
    initialTitle?: string;
    initialTags?: string;
  }) {
    const [error, setError] = React.useState<string | null>(null);
    const submit = () => {
      setError(null);
      Promise.resolve(
        onDraft?.({
          title: initialTitle?.trim() || 'Created doc',
          content: 'Scan',
          tags: initialTags
            ? initialTags.split(',').map((t) => t.trim()).filter(Boolean)
            : [],
          issued_date: null,
          expire_date: null,
          storage: mockDraft.storage,
        })
      ).catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
    };
    return (
      <View accessibilityLabel="Document create form">
        <Text accessibilityLabel="Prefill title">{initialTitle ?? ''}</Text>
        <Text accessibilityLabel="Prefill tags">{initialTags ?? ''}</Text>
        {error ? <Text accessibilityLabel="Document form error">{error}</Text> : null}
        <Pressable accessibilityLabel="Submit mocked document create" onPress={submit}>
          <Text>Submit</Text>
        </Pressable>
      </View>
    );
  },
}));

const mockUseAuth = vi.mocked(useAuth);
const mockAuthenticatedFetch = vi.mocked(authenticatedFetch);

function car(
  overrides: Partial<CarDto> & Pick<CarDto, 'id' | 'make' | 'model' | 'year'>
): CarDto {
  return {
    display_name: null,
    vin: null,
    license_plate: null,
    notes: null,
    insurance_document_id: null,
    registration_document_id: null,
    active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deactivated_at: null,
    ...overrides,
  };
}

function document(
  overrides: Partial<DocumentDto> & Pick<DocumentDto, 'id' | 'title'>
): DocumentDto {
  return {
    content: '',
    tags: [],
    created_at: '2026-01-01T00:00:00Z',
    issued_date: null,
    expire_date: null,
    storage: null,
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

function renderPanel() {
  return render(
    <TenantThemeTestProvider theme={defaultResolvedTheme}>
      <CarPanel />
    </TenantThemeTestProvider>
  );
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function emptyResponse(status = 204) {
  return new Response(null, { status });
}

/** GET /documents/{id} from a list of server Documents: the DTO, or 404. */
function documentByIdResponse(path: string, docs: DocumentDto[]) {
  const id = decodeURIComponent(path.slice('/documents/'.length));
  const found = docs.find((doc) => doc.id === id);
  return found ? jsonResponse(found) : jsonResponse({ error: 'not found' }, 404);
}

/** Default GET /cars, GET /documents and GET /documents/{id} (order may vary with parallel loads). */
function mockInitialLoads(cars: CarDto[] = [], docs: DocumentDto[] = []) {
  mockAuthenticatedFetch.mockImplementation(async (path: string) => {
    if (typeof path === 'string' && path.startsWith('/cars')) {
      return jsonResponse(cars);
    }
    if (typeof path === 'string' && path.startsWith('/documents/')) {
      return documentByIdResponse(path, docs);
    }
    if (typeof path === 'string' && path.startsWith('/documents')) {
      return jsonResponse(docs);
    }
    return jsonResponse([]);
  });
}

function callsTo(path: string, method?: string) {
  return mockAuthenticatedFetch.mock.calls.filter(
    (call) => call[0] === path && (method == null || call[1]?.method === method)
  );
}

function writeBodies() {
  return mockAuthenticatedFetch.mock.calls
    .filter((call) => call[1]?.method === 'PUT' || call[1]?.method === 'POST')
    .map((call) => ({ path: call[0], body: JSON.parse(String(call[1]?.body)) }));
}

async function chooseDocument(role: 'insurance' | 'registration', title: string, change = false) {
  fireEvent.press(screen.getByLabelText(`${change ? 'Change' : 'Choose'} ${role} document`));
  await waitFor(() => {
    expect(screen.getByLabelText(`Choose document ${title}`)).toBeTruthy();
  });
  fireEvent.press(screen.getByLabelText(`Choose document ${title}`));
  fireEvent.press(screen.getByLabelText('Select document'));
}

/** Saved Car c1 whose first PUT fails; later PUTs link the new Document d-created. */
async function givenFailedDocumentPersist(role: 'insurance' | 'registration') {
  let savedCar = car({ id: 'c1', make: 'Toyota', model: 'Corolla', year: 2018 });
  const created = document({ id: 'd-created', title: `2018 Toyota Corolla ${role}` });
  let failWrite = true;
  mockAuthenticatedFetch.mockImplementation(async (path, init) => {
    if (path === '/cars/c1' && init?.method === 'PUT') {
      if (failWrite) {
        failWrite = false;
        return jsonResponse({ error: 'Write failed' }, 500);
      }
      savedCar = { ...savedCar, [`${role}_document_id`]: created.id };
      return jsonResponse(savedCar);
    }
    if (path.startsWith('/cars')) {
      return jsonResponse([savedCar]);
    }
    if (path.startsWith('/documents/')) {
      return documentByIdResponse(path, savedCar[`${role}_document_id`] ? [created] : []);
    }
    return jsonResponse([]);
  });
  renderPanel();
  await waitFor(() => {
    expect(screen.getByLabelText('Select Car 2018 Toyota Corolla')).toBeTruthy();
  });
  fireEvent.press(screen.getByLabelText('Select Car 2018 Toyota Corolla'));
  fireEvent.press(screen.getByLabelText(`Create ${role} document`));
  fireEvent.press(screen.getByLabelText('Submit mocked document create'));
  await waitFor(() => {
    expect(screen.getByLabelText('Document form error')).toBeTruthy();
  });
}

describe('unicodeScalarLength', () => {
  it('counts Unicode scalars like Rust chars().count()', () => {
    expect(unicodeScalarLength('Toyota')).toBe(6);
    const hundredEmoji = '😀'.repeat(100);
    expect(hundredEmoji.length).toBe(200);
    expect(unicodeScalarLength(hundredEmoji)).toBe(100);
  });
});

it('given document metadata from the API then preserves it for the picker', () => {
  const owned = document({
    id: 'd1', title: 'Policy', issued_date: '2026-01-01', expire_date: '2027-01-01',
    storage: { provider: 'proton', share_id: 'share', node_id: 'node', filename: 'policy.pdf', mime_type: 'application/pdf' },
  });
  expect(parseOwnedDocumentDto(owned)).toEqual(owned);
});

describe('carDisplayLabel', () => {
  it('uses display_name when set, else year make model', () => {
    expect(
      carDisplayLabel(car({ id: '1', make: 'Toyota', model: 'Corolla', year: 2018 }))
    ).toBe('2018 Toyota Corolla');
    expect(
      carDisplayLabel(
        car({
          id: '1',
          make: 'Toyota',
          model: 'Corolla',
          year: 2018,
          display_name: 'Daily',
        })
      )
    ).toBe('Daily');
  });
});

describe('parseCarDto', () => {
  it('maps API fields including null document links', () => {
    const parsed = parseCarDto({
      id: 'c1',
      display_name: null,
      make: 'Toyota',
      model: 'Corolla',
      year: 2018,
      vin: null,
      license_plate: null,
      notes: null,
      insurance_document_id: null,
      registration_document_id: 'd1',
      active: true,
      created_at: 'a',
      updated_at: 'b',
      deactivated_at: null,
    });
    expect(parsed.registration_document_id).toBe('d1');
    expect(parsed.insurance_document_id).toBeNull();
  });
});

describe('car document create prefills', () => {
  it('builds title and tags from car label and role', () => {
    expect(carDocumentPrefillTitle('Daily', 'insurance')).toBe('Daily insurance');
    expect(carDocumentPrefillTitle('2018 Toyota Corolla', 'registration')).toBe(
      '2018 Toyota Corolla registration'
    );
    expect(carDocumentPrefillTags('insurance')).toBe('insurance');
    expect(carDocumentPrefillTags('registration')).toBe('registration');
  });

  it('builds draft label from form fields', () => {
    expect(
      carFormDraftLabel({
        displayName: 'Daily',
        make: 'Toyota',
        model: 'Corolla',
        year: '2018',
      })
    ).toBe('Daily');
    expect(
      carFormDraftLabel({
        displayName: '',
        make: 'Toyota',
        model: 'Corolla',
        year: '2018',
      })
    ).toBe('2018 Toyota Corolla');
    expect(
      carFormDraftLabel({
        displayName: '  ',
        make: '',
        model: '',
        year: '',
      })
    ).toBe('Car');
  });
});

describe('CarPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDraft.storage = null;
    mockUseAuth.mockReturnValue(defaultAuth());
    mockInitialLoads();
  });

  it('given no token when rendering then shows sign-in message', () => {
    // Given
    mockUseAuth.mockReturnValue(
      defaultAuth({ token: null, isAuthenticated: false })
    );
    // When
    renderPanel();
    // Then
    expect(screen.getByText('Sign in to manage Cars.')).toBeTruthy();
    expect(mockAuthenticatedFetch).not.toHaveBeenCalled();
  });

  it('Scenario: Create Car from Car Manager — Toyota Corolla 2018 appears', async () => {
    // Given I am on Car Manager (empty list)
    mockInitialLoads([]);
    renderPanel();
    await waitFor(() => {
      expect(screen.getByLabelText('Create Car')).toBeTruthy();
    });

    const created = car({
      id: 'c-corolla',
      make: 'Toyota',
      model: 'Corolla',
      year: 2018,
    });
    mockAuthenticatedFetch.mockImplementation(async (path, init) => {
      if (path === '/cars' && init?.method === 'POST') {
        return jsonResponse(created, 201);
      }
      if (typeof path === 'string' && path.startsWith('/cars')) {
        return jsonResponse([created]);
      }
      if (typeof path === 'string' && path.startsWith('/documents')) {
        return jsonResponse([]);
      }
      return jsonResponse([]);
    });

    // When I submit make Toyota, model Corolla, year 2018
    fireEvent.press(screen.getByLabelText('Create Car'));
    fireEvent.changeText(screen.getByLabelText('Create make'), 'Toyota');
    fireEvent.changeText(screen.getByLabelText('Create model'), 'Corolla');
    fireEvent.changeText(screen.getByLabelText('Create year'), '2018');
    fireEvent.press(screen.getByLabelText('Submit create Car'));

    // Then the Car appears in the cars list
    await waitFor(() => {
      expect(
        screen.getByLabelText('Select Car 2018 Toyota Corolla')
      ).toBeTruthy();
    });
    expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
      '/cars',
      expect.objectContaining({ method: 'POST' })
    );
    const postCall = mockAuthenticatedFetch.mock.calls.find(
      (call) => call[0] === '/cars' && call[1]?.method === 'POST'
    );
    expect(JSON.parse(String(postCall?.[1]?.body))).toMatchObject({
      make: 'Toyota',
      model: 'Corolla',
      year: 2018,
    });
    // And I remain on Car Manager
    expect(screen.getByLabelText('Create Car')).toBeTruthy();
  });

  it('Scenario: Link registration Document', async () => {
    // Given I own Car C and Document D titled "Registration 2018"
    const before = car({
      id: 'c1',
      make: 'Toyota',
      model: 'Corolla',
      year: 2018,
    });
    const regDoc = document({ id: 'd-reg', title: 'Registration 2018' });
    const after = car({
      ...before,
      registration_document_id: 'd-reg',
    });
    mockInitialLoads([before], [regDoc]);
    renderPanel();
    await waitFor(() => {
      expect(
        screen.getByLabelText('Select Car 2018 Toyota Corolla')
      ).toBeTruthy();
    });
    fireEvent.press(screen.getByLabelText('Select Car 2018 Toyota Corolla'));

    mockAuthenticatedFetch.mockImplementation(async (path, init) => {
      if (
        typeof path === 'string' &&
        path === '/cars/c1' &&
        init?.method === 'PUT'
      ) {
        return jsonResponse(after);
      }
      if (typeof path === 'string' && path.startsWith('/cars')) {
        return jsonResponse([after]);
      }
      if (typeof path === 'string' && path.startsWith('/documents')) {
        return jsonResponse([regDoc]);
      }
      return jsonResponse([]);
    });

    // When I set C’s registration link to D
    fireEvent.press(screen.getByLabelText('Edit Car'));
    expect(screen.queryByText('Registration 2018')).toBeNull();
    await chooseDocument('registration', 'Registration 2018');
    fireEvent.press(screen.getByLabelText('Save Car'));

    // Then the UI shows the linked document for C
    await waitFor(() => {
      expect(
        screen.getByLabelText(
          'Linked registration document Registration 2018'
        )
      ).toBeTruthy();
    });
    const putCall = mockAuthenticatedFetch.mock.calls.find(
      (call) => call[0] === '/cars/c1' && call[1]?.method === 'PUT'
    );
    expect(JSON.parse(String(putCall?.[1]?.body))).toMatchObject({
      registration_document_id: 'd-reg',
    });
  });

  it('Scenario: Selected car uses shared selected styles', async () => {
    // Given two cars exist
    const civic = car({
      id: 'c1',
      make: 'Honda',
      model: 'Civic',
      year: 2020,
    });
    const focus = car({
      id: 'c2',
      make: 'Ford',
      model: 'Focus',
      year: 2015,
    });
    mockInitialLoads([civic, focus]);
    renderPanel();
    await waitFor(() => {
      expect(screen.getByLabelText('Select Car 2020 Honda Civic')).toBeTruthy();
    });

    // When I select one
    fireEvent.press(screen.getByLabelText('Select Car 2020 Honda Civic'));

    // Then the selected car uses shared selected styles
    const selectedChip = screen.getByLabelText('Select Car 2020 Honda Civic');
    const unselectedChip = screen.getByLabelText('Select Car 2015 Ford Focus');
    expect(selectedChip.props.accessibilityState).toMatchObject({ selected: true });
    expect(unselectedChip.props.accessibilityState).toMatchObject({
      selected: false,
    });
    expect(selectedChip.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ borderLeftWidth: 4 }),
      ])
    );
    expect(screen.getByText('Selected: 2020 Honda Civic')).toBeTruthy();
  });

  it('Scenario: Deactivate Car — leaves default active picker', async () => {
    // Given active Car C is selected
    const c = car({
      id: 'c-dep',
      make: 'Honda',
      model: 'Civic',
      year: 2020,
    });
    mockInitialLoads([c]);
    renderPanel();
    await waitFor(() => {
      expect(screen.getByLabelText('Select Car 2020 Honda Civic')).toBeTruthy();
    });
    fireEvent.press(screen.getByLabelText('Select Car 2020 Honda Civic'));

    mockAuthenticatedFetch.mockImplementation(async (path, init) => {
      if (
        typeof path === 'string' &&
        path.endsWith('/deactivate') &&
        init?.method === 'POST'
      ) {
        return jsonResponse({ ...c, active: false });
      }
      if (typeof path === 'string' && path.startsWith('/cars')) {
        return jsonResponse([]);
      }
      if (typeof path === 'string' && path.startsWith('/documents')) {
        return jsonResponse([]);
      }
      return jsonResponse([]);
    });

    // When I deactivate C
    fireEvent.press(screen.getByLabelText('Deactivate Car'));
    expect(screen.getByText('Deactivate Car?')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Deactivate'));

    // Then C leaves the default active picker
    await waitFor(() => {
      expect(screen.queryByLabelText('Select Car 2020 Honda Civic')).toBeNull();
    });
    expect(
      screen.getByLabelText(
        'No Car selected. No cars yet. Add a car to manage maintenance later.'
      )
    ).toBeTruthy();
    expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
      '/cars/c-dep/deactivate',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('Scenario: Delete Car with confirm — removes car', async () => {
    // Given I own Car C
    const c = car({
      id: 'c-del',
      make: 'Ford',
      model: 'Focus',
      year: 2015,
    });
    mockInitialLoads([c]);
    renderPanel();
    await waitFor(() => {
      expect(screen.getByLabelText('Select Car 2015 Ford Focus')).toBeTruthy();
    });
    fireEvent.press(screen.getByLabelText('Select Car 2015 Ford Focus'));

    mockAuthenticatedFetch.mockImplementation(async (path, init) => {
      if (
        typeof path === 'string' &&
        path === '/cars/c-del' &&
        init?.method === 'DELETE'
      ) {
        return emptyResponse(204);
      }
      if (typeof path === 'string' && path.startsWith('/cars')) {
        return jsonResponse([]);
      }
      if (typeof path === 'string' && path.startsWith('/documents')) {
        return jsonResponse([]);
      }
      return jsonResponse([]);
    });

    // When I choose delete and confirm
    fireEvent.press(screen.getByLabelText('Delete Car'));
    expect(screen.getByText('Delete Car?')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Delete'));

    // Then C is removed from the list
    await waitFor(() => {
      expect(screen.queryByLabelText('Select Car 2015 Ford Focus')).toBeNull();
    });
    expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
      '/cars/c-del',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('Scenario: Cancel delete — car stays', async () => {
    const c = car({
      id: 'c-stay',
      make: 'Mazda',
      model: '3',
      year: 2019,
    });
    mockInitialLoads([c]);
    renderPanel();
    await waitFor(() => {
      expect(screen.getByLabelText('Select Car 2019 Mazda 3')).toBeTruthy();
    });
    fireEvent.press(screen.getByLabelText('Select Car 2019 Mazda 3'));
    fireEvent.press(screen.getByLabelText('Delete Car'));
    expect(screen.getByText('Delete Car?')).toBeTruthy();

    const callsBeforeCancel = mockAuthenticatedFetch.mock.calls.length;
    fireEvent.press(screen.getByLabelText('Cancel'));

    expect(screen.getByLabelText('Select Car 2019 Mazda 3')).toBeTruthy();
    expect(screen.queryByText('Delete Car?')).toBeNull();
    expect(mockAuthenticatedFetch.mock.calls.length).toBe(callsBeforeCancel);
  });

  it('given include-inactive when toggled then shows inactive cars', async () => {
    const inactive = car({
      id: 'c-in',
      make: 'Kia',
      model: 'Soul',
      year: 2016,
      active: false,
      deactivated_at: '2026-02-01T00:00:00Z',
    });
    mockInitialLoads([]);
    renderPanel();
    await waitFor(() => {
      expect(screen.getByLabelText('Include inactive Cars')).toBeTruthy();
    });

    mockAuthenticatedFetch.mockImplementation(async (path) => {
      if (
        typeof path === 'string' &&
        path.includes('include_inactive=true')
      ) {
        return jsonResponse([inactive]);
      }
      if (typeof path === 'string' && path.startsWith('/documents')) {
        return jsonResponse([]);
      }
      return jsonResponse([]);
    });

    fireEvent(screen.getByLabelText('Include inactive Cars'), 'valueChange', true);

    await waitFor(() => {
      expect(
        screen.getByLabelText('Select inactive Car 2016 Kia Soul')
      ).toBeTruthy();
    });
  });

  it('given empty make when create submitted then no POST', async () => {
    mockInitialLoads([]);
    renderPanel();
    await waitFor(() => {
      expect(screen.getByLabelText('Create Car')).toBeTruthy();
    });
    mockAuthenticatedFetch.mockClear();

    fireEvent.press(screen.getByLabelText('Create Car'));
    fireEvent.changeText(screen.getByLabelText('Create model'), 'Corolla');
    fireEvent.changeText(screen.getByLabelText('Create year'), '2018');
    fireEvent.press(screen.getByLabelText('Submit create Car'));

    expect(screen.getByText('Make is required.')).toBeTruthy();
    expect(mockAuthenticatedFetch).not.toHaveBeenCalledWith(
      '/cars',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it.each([
    { role: 'insurance', title: 'Daily insurance' },
    { role: 'registration', title: 'Daily registration' },
  ] as const)(
    'Scenario: Create $role Document and link it to the saved Car in one PUT',
    async ({ role, title }) => {
      // Given a saved, selected Car
      const before = car({ id: 'c1', make: 'Toyota', model: 'Corolla', year: 2018, display_name: 'Daily' });
      const created = document({ id: 'd-created', title, tags: [role] });
      const after = car({ ...before, [`${role}_document_id`]: 'd-created' });
      mockInitialLoads([before], []);
      renderPanel();
      await waitFor(() => expect(screen.getByLabelText('Select Car Daily')).toBeTruthy());
      fireEvent.press(screen.getByLabelText('Select Car Daily'));
      mockAuthenticatedFetch.mockImplementation(async (path, init) => {
        if (path === '/cars/c1' && init?.method === 'PUT') {
          return jsonResponse(after);
        }
        if (path.startsWith('/cars')) {
          return jsonResponse([after]);
        }
        if (path.startsWith('/documents/')) {
          return documentByIdResponse(path, [created]);
        }
        return jsonResponse([created]);
      });

      // When the user creates the Document from the Car detail
      fireEvent.press(screen.getByLabelText(`Create ${role} document`));
      await waitFor(() => expect(screen.getByLabelText('Prefill title')).toBeTruthy());
      expect(screen.getByLabelText('Prefill title').props.children).toBe(title);
      expect(screen.getByLabelText('Prefill tags').props.children).toBe(role);
      fireEvent.press(screen.getByLabelText('Submit mocked document create'));

      // Then one PUT carries only the new Document and the required fields
      await waitFor(() => expect(screen.getByLabelText(`Linked ${role} document ${title}`)).toBeTruthy());
      expect(screen.queryByLabelText('Document create form')).toBeNull();
      const writes = writeBodies();
      expect(writes).toHaveLength(1);
      expect(writes[0].path).toBe('/cars/c1');
      expect(writes[0].body).toEqual({
        make: 'Toyota',
        model: 'Corolla',
        year: 2018,
        active: null,
        [`new_${role}_document`]: {
          title,
          content: 'Scan',
          tags: [role],
          issued_date: null,
          expire_date: null,
          storage: null,
        },
      });
      expect(callsTo('/documents/d-created', 'GET')).toHaveLength(1);
    }
  );

  it('Scenario: Confirm before replace existing insurance link', async () => {
    // Given a saved Car with an insurance link
    const existing = document({ id: 'd1', title: 'Old insurance' });
    const before = car({ id: 'c1', make: 'Toyota', model: 'Corolla', year: 2018, insurance_document_id: 'd1' });
    const after = car({ ...before, insurance_document_id: 'd-created' });
    const created = document({ id: 'd-created', title: '2018 Toyota Corolla insurance', tags: ['insurance'] });
    mockInitialLoads([before], [existing]);
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText('Select Car 2018 Toyota Corolla')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Select Car 2018 Toyota Corolla'));

    // When the user cancels the replace confirm
    fireEvent.press(screen.getByLabelText('Create insurance document'));
    expect(screen.getByText('Replace linked document?')).toBeTruthy();
    const callsBeforeCancel = mockAuthenticatedFetch.mock.calls.length;
    fireEvent.press(screen.getByLabelText('Cancel'));
    // Then nothing changes
    expect(screen.queryByLabelText('Document create form')).toBeNull();
    expect(screen.getByLabelText('Linked insurance document Old insurance')).toBeTruthy();
    expect(mockAuthenticatedFetch.mock.calls.length).toBe(callsBeforeCancel);

    // When the user confirms and creates the Document
    fireEvent.press(screen.getByLabelText('Create insurance document'));
    fireEvent.press(screen.getByLabelText('Replace'));
    mockAuthenticatedFetch.mockImplementation(async (path, init) => {
      if (path === '/cars/c1' && init?.method === 'PUT') {
        return jsonResponse(after);
      }
      if (path.startsWith('/cars')) {
        return jsonResponse([after]);
      }
      if (path.startsWith('/documents/')) {
        return documentByIdResponse(path, [existing, created]);
      }
      return jsonResponse([existing, created]);
    });
    await waitFor(() => expect(screen.getByLabelText('Document create form')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Submit mocked document create'));
    // Then the new Document replaces the link
    await waitFor(() => {
      expect(screen.getByLabelText('Linked insurance document 2018 Toyota Corolla insurance')).toBeTruthy();
    });
  });

  it('Scenario: Create Document while editing Car form, then save in one PUT', async () => {
    // Given an edit form with an existing insurance link
    const before = car({ id: 'c1', make: 'Toyota', model: 'Corolla', year: 2018, insurance_document_id: 'd1' });
    const existing = document({ id: 'd1', title: 'Old insurance' });
    const created = document({ id: 'd-created', title: '2018 Toyota Corolla insurance' });
    const after = { ...before, insurance_document_id: 'd-created' };
    let serverCar = before;
    mockAuthenticatedFetch.mockImplementation(async (path, init) => {
      if (path === '/cars/c1' && init?.method === 'PUT') {
        serverCar = after;
        return jsonResponse(after);
      }
      if (path.startsWith('/cars')) {
        return jsonResponse([serverCar]);
      }
      if (path.startsWith('/documents/')) {
        return documentByIdResponse(path, [existing, created]);
      }
      return jsonResponse([existing]);
    });
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText('Select Car 2018 Toyota Corolla')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Select Car 2018 Toyota Corolla'));
    fireEvent.press(screen.getByLabelText('Edit Car'));

    // When the user replaces the link with a new draft
    fireEvent.press(screen.getByLabelText('Edit create insurance document'));
    fireEvent.press(screen.getByLabelText('Replace'));
    await waitFor(() => expect(screen.getByLabelText('Document create form')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Submit mocked document create'));
    // Then no write runs before Save
    await waitFor(() => expect(screen.getByText('2018 Toyota Corolla insurance (new)')).toBeTruthy());
    expect(writeBodies()).toHaveLength(0);
    expect(screen.getByLabelText('Save Car')).toBeTruthy();

    // When the user saves the Car
    fireEvent.press(screen.getByLabelText('Save Car'));
    // Then one PUT creates the Document; the role id is null, not the old id
    await waitFor(() => {
      expect(screen.getByLabelText('Linked insurance document 2018 Toyota Corolla insurance')).toBeTruthy();
    });
    const writes = writeBodies();
    expect(writes).toHaveLength(1);
    expect(writes[0].body).toMatchObject({
      insurance_document_id: null,
      registration_document_id: null,
      new_insurance_document: { title: '2018 Toyota Corolla insurance' },
      active: null,
    });
    expect(callsTo('/documents/d-created', 'GET')).toHaveLength(1);
  });

  it.each(['insurance', 'registration'] as const)(
    'given a failed %s Document write from the saved Car when submitted again then the same draft is sent',
    async (role) => {
      // Given the first PUT failed
      await givenFailedDocumentPersist(role);
      // Then the form stays open with the error and no Document is loaded
      expect(screen.getByLabelText('Document form error').props.children).toMatch(/Request failed \(500\)/);
      expect(screen.getByLabelText('Document create form')).toBeTruthy();
      expect(callsTo(`/documents/d-created`)).toHaveLength(0);
      expect(screen.getByLabelText(`No ${role} document linked`)).toBeTruthy();

      // When the user submits again
      fireEvent.press(screen.getByLabelText('Submit mocked document create'));
      // Then the same draft is sent and the Document is linked
      await waitFor(() => {
        expect(screen.getByLabelText(`Linked ${role} document 2018 Toyota Corolla ${role}`)).toBeTruthy();
      });
      const writes = writeBodies();
      expect(writes).toHaveLength(2);
      expect(writes[1].body).toEqual(writes[0].body);
      expect(screen.queryByLabelText('Document create form')).toBeNull();
    }
  );

  it('given a deactivated saved Car when its Document draft is submitted then nothing is sent', async () => {
    // Given a create session for a saved Car that another tab deactivates
    const active = car({ id: 'c1', make: 'Toyota', model: 'Corolla', year: 2018 });
    let serverCar = active;
    mockAuthenticatedFetch.mockImplementation(async (path) => {
      if (path === '/cars/c1/deactivate') {
        serverCar = { ...active, active: false };
        return emptyResponse();
      }
      if (path.startsWith('/cars')) {
        return jsonResponse(path.includes('include_inactive=true') || serverCar.active ? [serverCar] : []);
      }
      return jsonResponse([]);
    });
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText('Select Car 2018 Toyota Corolla')).toBeTruthy());
    fireEvent(screen.getByLabelText('Include inactive Cars'), 'valueChange', true);
    await waitFor(() => expect(screen.getByLabelText('Select Car 2018 Toyota Corolla')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Select Car 2018 Toyota Corolla'));
    fireEvent.press(screen.getByLabelText('Create insurance document'));
    serverCar = { ...active, active: false };
    fireEvent(screen.getByLabelText('Include inactive Cars'), 'valueChange', false);
    fireEvent(screen.getByLabelText('Include inactive Cars'), 'valueChange', true);
    await waitFor(() => expect(screen.getByLabelText('Select inactive Car 2018 Toyota Corolla')).toBeTruthy());
    // When the user submits the draft
    fireEvent.press(screen.getByLabelText('Submit mocked document create'));
    // Then the form shows why and no write is sent
    await waitFor(() => {
      expect(screen.getByLabelText('Document form error').props.children).toBe(
        'Reactivate the Car before you add a Document to it.'
      );
    });
    expect(writeBodies()).toHaveLength(0);
  });

  it.each(['insurance', 'registration'] as const)(
    'given a new Car form when choosing, changing, cancelling, and removing %s then only confirmation updates the field',
    async (role) => {
      const first = document({ id: 'd1', title: 'Policy first' });
      const second = document({ id: 'd2', title: 'Policy second' });
      mockInitialLoads([], [first, second]);
      renderPanel();
      await waitFor(() => expect(screen.getByLabelText('Create Car')).toBeTruthy());
      fireEvent.press(screen.getByLabelText('Create Car'));
      fireEvent.changeText(screen.getByLabelText('Create make'), 'Unsaved make');
      expect(screen.queryByText(first.title)).toBeNull();
      expect(screen.queryByText(second.title)).toBeNull();
      expect(screen.getByLabelText(`Choose ${role} document`)).toBeTruthy();
      fireEvent.press(screen.getByLabelText(`Choose ${role} document`));
      await waitFor(() => expect(screen.getByLabelText(`Choose document ${first.title}`)).toBeTruthy());
      expect(screen.getByLabelText('Submit create Car', { includeHiddenElements: true }).props.accessibilityState.disabled).toBe(true);
      fireEvent.changeText(screen.getByLabelText('Search documents'), 'first');
      expect(screen.queryByLabelText(`Choose document ${second.title}`)).toBeNull();
      fireEvent.press(screen.getByLabelText(`Choose document ${first.title}`));
      expect(screen.queryByLabelText(`Selected ${role} document`)).toBeNull();
      fireEvent.press(screen.getByLabelText('Select document'));
      expect(screen.getByLabelText(`Selected ${role} document`).props.children).toBe(first.title);
      expect(screen.queryByLabelText(`Choose document ${first.title}`)).toBeNull();
      expect(screen.queryByText(second.title)).toBeNull();
      fireEvent.press(screen.getByLabelText(`Change ${role} document`));
      await waitFor(() => expect(screen.getByLabelText(`Choose document ${second.title}`)).toBeTruthy());
      fireEvent.press(screen.getByLabelText(`Choose document ${second.title}`));
      fireEvent.press(screen.getByLabelText('Cancel document selection'));
      expect(screen.getByLabelText(`Selected ${role} document`).props.children).toBe(first.title);
      expect(screen.getByLabelText('Create make').props.value).toBe('Unsaved make');
      fireEvent.press(screen.getByLabelText(`Change ${role} document`));
      fireEvent.press(screen.getByLabelText('Close document picker'));
      expect(screen.getByLabelText(`Selected ${role} document`).props.children).toBe(first.title);
      fireEvent.press(screen.getByLabelText(`Remove ${role} document`));
      expect(screen.queryByLabelText(`Selected ${role} document`)).toBeNull();
      expect(screen.getByLabelText(`Choose ${role} document`)).toBeTruthy();
      expect(mockAuthenticatedFetch.mock.calls.every((call) => !call[1]?.method || call[1]?.method === 'GET')).toBe(true);
    }
  );

  it('given an open picker when the selected Car changes then closes without applying the draft', async () => {
    const first = car({ id: 'c1', make: 'Toyota', model: 'Corolla', year: 2018 });
    const second = car({ ...first, id: 'c2', display_name: 'Second Car' });
    mockInitialLoads([first, second], [document({ id: 'd1', title: 'Insurance' })]);
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText('Select Car 2018 Toyota Corolla')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Select Car 2018 Toyota Corolla'));
    fireEvent.press(screen.getByLabelText('Edit Car'));
    fireEvent.press(screen.getByLabelText('Choose insurance document'));
    await waitFor(() => expect(screen.getByLabelText('Choose document Insurance')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Choose document Insurance'));
    fireEvent.press(screen.getByLabelText('Select Car Second Car', { includeHiddenElements: true }));
    expect(screen.queryByLabelText('Search documents')).toBeNull();
    expect(screen.getByLabelText('No insurance document linked')).toBeTruthy();
  });

  it('given a new draft in the edit form when shown then the field marks it new and no request is sent', async () => {
    // Given an edit form
    const before = car({ id: 'c1', make: 'Toyota', model: 'Corolla', year: 2018 });
    mockInitialLoads([before], []);
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText('Select Car 2018 Toyota Corolla')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Select Car 2018 Toyota Corolla'));
    fireEvent.press(screen.getByLabelText('Edit Car'));
    // When the user submits the create-document form
    fireEvent.press(screen.getByLabelText('Edit create insurance document'));
    fireEvent.press(screen.getByLabelText('Submit mocked document create'));
    // Then the field shows the draft title as new and nothing is written
    await waitFor(() => {
      expect(
        screen.getByLabelText('Selected insurance document, new, created when you save the Car').props.children
      ).toBe('2018 Toyota Corolla insurance (new)');
    });
    expect(screen.queryByLabelText('Document create form')).toBeNull();
    expect(writeBodies()).toHaveLength(0);
    expect(screen.getByText(/Save the Car to create and link it\./)).toBeTruthy();
  });

  it.each([
    {
      mode: 'create',
      open: () => {
        fireEvent.press(screen.getByLabelText('Create Car'));
        fireEvent.changeText(screen.getByLabelText('Create make'), 'Toyota');
        fireEvent.changeText(screen.getByLabelText('Create model'), 'Corolla');
        fireEvent.changeText(screen.getByLabelText('Create year'), '2018');
      },
      submitLabel: 'Submit create Car',
      isCarRequest: (path: string, method?: string) => path === '/cars' && method === 'POST',
      prefix: 'Create',
    },
    {
      mode: 'edit',
      open: () => {
        fireEvent.press(screen.getByLabelText('Select Car 2018 Toyota Corolla'));
        fireEvent.press(screen.getByLabelText('Edit Car'));
      },
      submitLabel: 'Save Car',
      isCarRequest: (path: string, method?: string) => path === '/cars/c1' && method === 'PUT',
      prefix: 'Edit',
    },
  ])(
    'given a slow $mode Car request when document actions are pressed then no document session opens',
    async ({ open, submitLabel, isCarRequest, prefix }) => {
      const saved = car({ id: 'c1', make: 'Toyota', model: 'Corolla', year: 2018 });
      const existing = document({ id: 'd1', title: 'Existing policy' });
      let resolveCar!: (response: Response) => void;
      mockAuthenticatedFetch.mockImplementation(async (path, init) => {
        if (isCarRequest(path, init?.method)) {
          return new Promise<Response>((resolve) => { resolveCar = resolve; });
        }
        if (path.startsWith('/cars')) {
          return jsonResponse([saved]);
        }
        return jsonResponse([existing]);
      });
      renderPanel();
      await waitFor(() => expect(screen.getByLabelText('Select Car 2018 Toyota Corolla')).toBeTruthy());
      open();
      fireEvent.press(screen.getByLabelText(submitLabel));

      for (const role of ['insurance', 'registration'] as const) {
        const create = screen.getByLabelText(`${prefix} create ${role} document`, { includeHiddenElements: true });
        const choose = screen.getByLabelText(`Choose ${role} document`, { includeHiddenElements: true });
        expect(create.props.accessibilityState.disabled).toBe(true);
        expect(choose.props.accessibilityState.disabled).toBe(true);
        fireEvent.press(create);
        fireEvent.press(choose);
      }
      expect(screen.queryByLabelText('Document create form')).toBeNull();
      expect(screen.queryByLabelText('Search documents')).toBeNull();

      await act(async () => { resolveCar(jsonResponse(saved)); });
      await waitFor(() => expect(screen.queryByLabelText(submitLabel)).toBeNull());
      expect(screen.queryByLabelText('Document create form')).toBeNull();
      expect(mockAuthenticatedFetch.mock.calls.filter((call) => call[1]?.method === 'PUT' || call[1]?.method === 'POST')).toHaveLength(1);
    }
  );

  it('given a document session when the edit form closes before the draft is ready then nothing is added or sent', async () => {
    // Given a create session from the edit form
    const before = car({ id: 'c1', make: 'Toyota', model: 'Corolla', year: 2018 });
    mockInitialLoads([before], []);
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText('Select Car 2018 Toyota Corolla')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Select Car 2018 Toyota Corolla'));
    fireEvent.press(screen.getByLabelText('Edit Car'));
    fireEvent.press(screen.getByLabelText('Edit create insurance document'));
    // When the edit form closes and then the draft is submitted
    fireEvent.press(screen.getByLabelText('Cancel edit Car', { includeHiddenElements: true }));
    fireEvent.press(screen.getByLabelText('Submit mocked document create'));
    // Then the draft is dropped and no write is sent
    await waitFor(() => {
      expect(screen.getByText('The Car form closed, so the new Document was not added.')).toBeTruthy();
    });
    fireEvent.press(screen.getByLabelText('Edit Car'));
    expect(screen.queryByLabelText(/^Selected insurance document/)).toBeNull();
    expect(writeBodies()).toHaveLength(0);
  });

  it('given loaded and created Documents with files when searching by filename then the picker shows file metadata', async () => {
    // Given a loaded Document with a file and a draft with a Proton file
    const before = car({ id: 'c1', make: 'Toyota', model: 'Corolla', year: 2018 });
    const loaded = document({
      id: 'd1',
      title: 'Loaded policy',
      storage: { provider: 'proton', share_id: 's', node_id: 'n1', filename: 'loaded-scan.pdf', mime_type: 'application/pdf' },
    });
    const createdStorage = { provider: 'proton', share_id: 's', node_id: 'n2', filename: 'created-card.png', mime_type: 'image/png' };
    const createdTitle = '2018 Toyota Corolla registration';
    const created = document({ id: 'd-created', title: createdTitle, storage: createdStorage });
    const linked = { ...before, registration_document_id: 'd-created' };
    mockDraft.storage = createdStorage;
    let serverCar = before;
    let serverDocs = [loaded];
    mockAuthenticatedFetch.mockImplementation(async (path, init) => {
      if (path === '/cars/c1' && init?.method === 'PUT') {
        serverCar = linked;
        serverDocs = [loaded, created];
        return jsonResponse(linked);
      }
      if (path.startsWith('/cars')) {
        return jsonResponse([serverCar]);
      }
      if (path.startsWith('/documents/')) {
        return documentByIdResponse(path, serverDocs);
      }
      return jsonResponse(serverDocs);
    });
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText('Select Car 2018 Toyota Corolla')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Select Car 2018 Toyota Corolla'));
    fireEvent.press(screen.getByLabelText('Edit Car'));
    fireEvent.press(screen.getByLabelText('Edit create registration document'));
    fireEvent.press(screen.getByLabelText('Submit mocked document create'));
    fireEvent.press(screen.getByLabelText('Save Car'));
    await waitFor(() => expect(screen.getByLabelText(`Linked registration document ${createdTitle}`)).toBeTruthy());
    expect(writeBodies()[0].body.new_registration_document.storage).toEqual(createdStorage);

    // When the user searches by file name in the picker
    fireEvent.press(screen.getByLabelText('Edit Car'));
    fireEvent.press(screen.getByLabelText('Choose insurance document'));
    await waitFor(() => expect(screen.getByLabelText('Choose document Loaded policy')).toBeTruthy());
    fireEvent.changeText(screen.getByLabelText('Search documents'), 'LOADED-SCAN');
    // Then each Document shows its file name and file type
    expect(screen.getByText('loaded-scan.pdf')).toBeTruthy();
    expect(screen.getByText('File type: application/pdf')).toBeTruthy();
    expect(screen.queryByLabelText(`Choose document ${createdTitle}`)).toBeNull();
    fireEvent.changeText(screen.getByLabelText('Search documents'), 'created-card');
    expect(screen.getByLabelText(`Choose document ${createdTitle}`)).toBeTruthy();
    expect(screen.getByText('created-card.png')).toBeTruthy();
    expect(screen.getByText('File type: image/png')).toBeTruthy();
    expect(screen.queryByLabelText('Choose document Loaded policy')).toBeNull();
  });

  it('given an older document GET that omits a new Document when it resolves then the library and the new link both stay', async () => {
    // Given the mount GET failed and a later GET is still in flight
    const before = car({ id: 'c1', make: 'Toyota', model: 'Corolla', year: 2018, registration_document_id: 'd1' });
    const existing = document({ id: 'd1', title: 'Existing registration' });
    const created = document({ id: 'd-created', title: '2018 Toyota Corolla insurance' });
    const linked = { ...before, insurance_document_id: 'd-created' };
    mockAuthenticatedFetch.mockImplementation(async (path) =>
      path.startsWith('/cars') ? jsonResponse([before]) : jsonResponse({ error: 'down' }, 500));
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText('Select Car 2018 Toyota Corolla')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Select Car 2018 Toyota Corolla'));
    let resolveOld!: (response: Response) => void;
    let carsAfterWrite = [before];
    mockAuthenticatedFetch.mockImplementation(async (path, init) => {
      if (path === '/cars/c1' && init?.method === 'PUT') {
        carsAfterWrite = [linked];
        return jsonResponse(linked);
      }
      if (path.startsWith('/cars')) {
        return jsonResponse(carsAfterWrite);
      }
      if (path.startsWith('/documents/')) {
        return documentByIdResponse(path, [existing, created]);
      }
      return new Promise<Response>((resolve) => { resolveOld = resolve; });
    });
    fireEvent.press(screen.getByLabelText('Edit Car'));
    fireEvent.press(screen.getByLabelText('Edit create insurance document'));
    fireEvent.press(screen.getByLabelText('Submit mocked document create'));
    // When the Car write creates the Document and then the older GET resolves
    fireEvent.press(screen.getByLabelText('Save Car'));
    await waitFor(() => expect(callsTo('/documents/d-created')).toHaveLength(1));
    await act(async () => { resolveOld(jsonResponse([existing])); });
    // Then both links show their titles
    await waitFor(() => {
      expect(screen.getByLabelText('Linked insurance document 2018 Toyota Corolla insurance')).toBeTruthy();
    });
    expect(screen.getByLabelText('Linked registration document Existing registration')).toBeTruthy();
  });

  it('given a created Document when two document GETs fail then its linked title stays', async () => {
    // Given a Car write that created a Document
    const before = car({ id: 'c1', make: 'Toyota', model: 'Corolla', year: 2018 });
    const created = document({ id: 'd-created', title: '2018 Toyota Corolla insurance' });
    const linked = { ...before, insurance_document_id: 'd-created' };
    let serverCar = before;
    mockAuthenticatedFetch.mockImplementation(async (path, init) => {
      if (path === '/cars/c1' && init?.method === 'PUT') {
        serverCar = linked;
        return jsonResponse(linked);
      }
      if (path.startsWith('/cars')) {
        return jsonResponse([serverCar]);
      }
      if (path.startsWith('/documents/')) {
        return documentByIdResponse(path, [created]);
      }
      return jsonResponse([]);
    });
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText('Select Car 2018 Toyota Corolla')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Select Car 2018 Toyota Corolla'));
    fireEvent.press(screen.getByLabelText('Edit Car'));
    fireEvent.press(screen.getByLabelText('Edit create insurance document'));
    fireEvent.press(screen.getByLabelText('Submit mocked document create'));
    fireEvent.press(screen.getByLabelText('Save Car'));
    await waitFor(() => expect(screen.getByLabelText('Linked insurance document 2018 Toyota Corolla insurance')).toBeTruthy());

    // When two document-list GETs fail
    mockAuthenticatedFetch.mockImplementation(async (path) =>
      path.startsWith('/cars') ? jsonResponse([linked]) : jsonResponse({ error: 'down' }, 500));
    fireEvent.press(screen.getByLabelText('Edit Car'));
    await waitFor(() => expect(screen.getByLabelText('Choose registration document')).toBeTruthy());
    const documentGetsBefore = callsTo('/documents').length;
    fireEvent.press(screen.getByLabelText('Choose registration document'));
    await waitFor(() => expect(screen.getByLabelText('Retry loading documents')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Retry loading documents'));
    await waitFor(() => expect(callsTo('/documents')).toHaveLength(documentGetsBefore + 2));
    await waitFor(() => expect(screen.getByLabelText('Retry loading documents')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Close document picker'));
    // Then the link keeps its title
    expect(screen.getByLabelText('Selected insurance document').props.children).toBe('2018 Toyota Corolla insurance');
  });

  it('given a created Document deleted later when a newer GET omits it then it is not added back', async () => {
    // Given a Car write that created a Document
    const before = car({ id: 'c1', make: 'Toyota', model: 'Corolla', year: 2018 });
    const existing = document({ id: 'd1', title: 'Existing policy' });
    const created = document({ id: 'd-created', title: '2018 Toyota Corolla insurance' });
    const linked = { ...before, insurance_document_id: 'd-created' };
    let serverCar = before;
    mockAuthenticatedFetch.mockImplementation(async (path, init) => {
      if (path === '/cars/c1' && init?.method === 'PUT') {
        serverCar = linked;
        return jsonResponse(linked);
      }
      if (path.startsWith('/cars')) {
        return jsonResponse([serverCar]);
      }
      if (path.startsWith('/documents/')) {
        return documentByIdResponse(path, [existing, created]);
      }
      return jsonResponse([existing]);
    });
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText('Select Car 2018 Toyota Corolla')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Select Car 2018 Toyota Corolla'));
    fireEvent.press(screen.getByLabelText('Edit Car'));
    fireEvent.press(screen.getByLabelText('Edit create insurance document'));
    fireEvent.press(screen.getByLabelText('Submit mocked document create'));
    fireEvent.press(screen.getByLabelText('Save Car'));
    await waitFor(() => expect(screen.getByLabelText('Linked insurance document 2018 Toyota Corolla insurance')).toBeTruthy());

    // When the Document is deleted elsewhere and a newer GET omits it
    fireEvent.press(screen.getByLabelText('Edit Car'));
    fireEvent.press(screen.getByLabelText('Choose registration document'));
    // Then the picker does not add it back
    await waitFor(() => expect(screen.getByLabelText('Choose document Existing policy')).toBeTruthy());
    expect(screen.queryByLabelText('Choose document 2018 Toyota Corolla insurance')).toBeNull();
  });

  it('given a saved Car link refresh when the user selects another Car then the selection stays on that Car', async () => {
    // Given a saved-Car Document create whose Car refresh is slow
    const first = car({ id: 'c1', make: 'Toyota', model: 'Corolla', year: 2018 });
    const second = car({ id: 'c2', make: 'Honda', model: 'Civic', year: 2020 });
    const linked = { ...first, insurance_document_id: 'd-created' };
    const created = document({ id: 'd-created', title: '2018 Toyota Corolla insurance' });
    mockInitialLoads([first, second], []);
    const onSelectedCarChange = vi.fn();
    render(
      <TenantThemeTestProvider theme={defaultResolvedTheme}>
        <CarPanel onSelectedCarChange={onSelectedCarChange} />
      </TenantThemeTestProvider>
    );
    await waitFor(() => expect(screen.getByLabelText('Select Car 2018 Toyota Corolla')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Select Car 2018 Toyota Corolla'));
    let resolveCars!: (response: Response) => void;
    mockAuthenticatedFetch.mockImplementation(async (path, init) => {
      if (path === '/cars/c1' && init?.method === 'PUT') {
        return jsonResponse(linked);
      }
      if (path.startsWith('/cars')) {
        return new Promise<Response>((resolve) => { resolveCars = resolve; });
      }
      if (path.startsWith('/documents/')) {
        return documentByIdResponse(path, [created]);
      }
      return jsonResponse([]);
    });
    fireEvent.press(screen.getByLabelText('Create insurance document'));
    fireEvent.press(screen.getByLabelText('Submit mocked document create'));
    await waitFor(() => expect(resolveCars).toBeTruthy());

    // When the user selects another Car before the refresh ends
    fireEvent.press(screen.getByLabelText('Select Car 2020 Honda Civic'));
    await act(async () => { resolveCars(jsonResponse([linked, second])); });

    // Then the selection stays on that Car
    await waitFor(() => expect(screen.getByText(/created and linked\./)).toBeTruthy());
    expect(screen.getByLabelText('Select Car 2020 Honda Civic').props.accessibilityState.selected).toBe(true);
    expect(onSelectedCarChange).toHaveBeenLastCalledWith(second);
  });

  it('given a new insurance draft when the Car is created then one POST creates and links it', async () => {
    // Given a create form with a new insurance draft
    const created = document({ id: 'd-created', title: '2018 Toyota Corolla insurance', tags: ['insurance'] });
    const saved = car({ id: 'c1', make: 'Toyota', model: 'Corolla', year: 2018, insurance_document_id: 'd-created' });
    let serverCars: CarDto[] = [];
    mockAuthenticatedFetch.mockImplementation(async (path, init) => {
      if (path === '/cars' && init?.method === 'POST') {
        serverCars = [saved];
        return jsonResponse(saved, 201);
      }
      if (path.startsWith('/cars')) {
        return jsonResponse(serverCars);
      }
      if (path.startsWith('/documents/')) {
        return documentByIdResponse(path, [created]);
      }
      return jsonResponse([]);
    });
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText('Create Car')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Create Car'));
    fireEvent.changeText(screen.getByLabelText('Create make'), 'Toyota');
    fireEvent.changeText(screen.getByLabelText('Create model'), 'Corolla');
    fireEvent.changeText(screen.getByLabelText('Create year'), '2018');
    fireEvent.press(screen.getByLabelText('Create create insurance document'));
    fireEvent.press(screen.getByLabelText('Submit mocked document create'));
    await waitFor(() => expect(screen.getByText('2018 Toyota Corolla insurance (new)')).toBeTruthy());
    // When the user saves the Car
    fireEvent.press(screen.getByLabelText('Submit create Car'));
    // Then one POST carries the new Document and no POST /documents is sent
    await waitFor(() => expect(screen.getByLabelText('Linked insurance document 2018 Toyota Corolla insurance')).toBeTruthy());
    const writes = writeBodies();
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe('/cars');
    expect(writes[0].body).toMatchObject({
      insurance_document_id: null,
      registration_document_id: null,
      new_insurance_document: {
        title: '2018 Toyota Corolla insurance',
        tags: ['insurance'],
        storage: null,
      },
    });
    expect(writes[0].body).not.toHaveProperty('new_registration_document');
    expect(callsTo('/documents/d-created', 'GET')).toHaveLength(1);
  });

  it('given a failed Car create when saved again then the same draft is sent and no Document is loaded', async () => {
    // Given the first POST fails with a duplicate VIN
    const saved = car({ id: 'c1', make: 'Toyota', model: 'Corolla', year: 2018, registration_document_id: 'd-created' });
    const created = document({ id: 'd-created', title: '2018 Toyota Corolla registration' });
    let failCreate = true;
    let serverCars: CarDto[] = [];
    mockAuthenticatedFetch.mockImplementation(async (path, init) => {
      if (path === '/cars' && init?.method === 'POST') {
        if (failCreate) {
          failCreate = false;
          return jsonResponse({ error: 'duplicate VIN' }, 409);
        }
        serverCars = [saved];
        return jsonResponse(saved, 201);
      }
      if (path.startsWith('/cars')) {
        return jsonResponse(serverCars);
      }
      if (path.startsWith('/documents/')) {
        return documentByIdResponse(path, serverCars.length ? [created] : []);
      }
      return jsonResponse([]);
    });
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText('Create Car')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Create Car'));
    fireEvent.changeText(screen.getByLabelText('Create make'), 'Toyota');
    fireEvent.changeText(screen.getByLabelText('Create model'), 'Corolla');
    fireEvent.changeText(screen.getByLabelText('Create year'), '2018');
    fireEvent.press(screen.getByLabelText('Create create registration document'));
    fireEvent.press(screen.getByLabelText('Submit mocked document create'));
    // When the save fails
    fireEvent.press(screen.getByLabelText('Submit create Car'));
    await waitFor(() => expect(screen.getByText(/Request failed \(409\)/)).toBeTruthy());
    // Then the draft stays and no Document was loaded
    expect(screen.getByText('2018 Toyota Corolla registration (new)')).toBeTruthy();
    expect(callsTo('/documents/d-created')).toHaveLength(0);
    // When the user saves again
    fireEvent.press(screen.getByLabelText('Submit create Car'));
    // Then the same draft is sent once more
    await waitFor(() => expect(screen.getByLabelText('Linked registration document 2018 Toyota Corolla registration')).toBeTruthy());
    const writes = writeBodies();
    expect(writes).toHaveLength(2);
    expect(writes[1].body.new_registration_document).toEqual(writes[0].body.new_registration_document);
  });

  it('given the new Document cannot be loaded after the write when shown then the link stays with its id', async () => {
    // Given a Car write that succeeds and a GET /documents/{id} that fails
    const before = car({ id: 'c1', make: 'Toyota', model: 'Corolla', year: 2018 });
    const linked = { ...before, insurance_document_id: 'd-created' };
    let serverCar = before;
    mockAuthenticatedFetch.mockImplementation(async (path, init) => {
      if (path === '/cars/c1' && init?.method === 'PUT') {
        serverCar = linked;
        return jsonResponse(linked);
      }
      if (path.startsWith('/cars')) {
        return jsonResponse([serverCar]);
      }
      if (path.startsWith('/documents/')) {
        return jsonResponse({ error: 'down' }, 500);
      }
      return jsonResponse([]);
    });
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText('Select Car 2018 Toyota Corolla')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Select Car 2018 Toyota Corolla'));
    // When the user creates the Document from the saved Car
    fireEvent.press(screen.getByLabelText('Create insurance document'));
    fireEvent.press(screen.getByLabelText('Submit mocked document create'));
    // Then the Car shows the link and the success message
    await waitFor(() => expect(screen.getByText(/created and linked\./)).toBeTruthy());
    expect(screen.getByLabelText('Linked insurance document d-created')).toBeTruthy();
    expect(callsTo('/documents/d-created')).toHaveLength(1);
  });

  it('given an edit save with a new draft when the user selects another Car during the refresh then the selection stays', async () => {
    // Given an edit save whose GET /documents/{id} is slow
    const first = car({ id: 'c1', make: 'Toyota', model: 'Corolla', year: 2018 });
    const second = car({ id: 'c2', make: 'Honda', model: 'Civic', year: 2020 });
    const linked = { ...first, insurance_document_id: 'd-created' };
    const created = document({ id: 'd-created', title: '2018 Toyota Corolla insurance' });
    let resolveDocument!: (response: Response) => void;
    let serverCars = [first, second];
    mockAuthenticatedFetch.mockImplementation(async (path, init) => {
      if (path === '/cars/c1' && init?.method === 'PUT') {
        serverCars = [linked, second];
        return jsonResponse(linked);
      }
      if (path.startsWith('/cars')) {
        return jsonResponse(serverCars);
      }
      if (path.startsWith('/documents/')) {
        return new Promise<Response>((resolve) => { resolveDocument = resolve; });
      }
      return jsonResponse([]);
    });
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText('Select Car 2018 Toyota Corolla')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Select Car 2018 Toyota Corolla'));
    fireEvent.press(screen.getByLabelText('Edit Car'));
    fireEvent.press(screen.getByLabelText('Edit create insurance document'));
    fireEvent.press(screen.getByLabelText('Submit mocked document create'));
    fireEvent.press(screen.getByLabelText('Save Car'));
    await waitFor(() => expect(resolveDocument).toBeTruthy());

    // When the user selects another Car before the refresh ends
    fireEvent.press(screen.getByLabelText('Select Car 2020 Honda Civic'));
    await act(async () => { resolveDocument(jsonResponse(created)); });

    // Then the selection stays on that Car
    await waitFor(() => expect(screen.getByText(/updated\./)).toBeTruthy());
    expect(screen.getByLabelText('Select Car 2020 Honda Civic').props.accessibilityState.selected).toBe(true);
  });

  it('given an edit save with a new draft when the user opens a new edit during the refresh then the form stays open', async () => {
    // Given an edit save whose GET /documents/{id} is slow
    const before = car({ id: 'c1', make: 'Toyota', model: 'Corolla', year: 2018 });
    const linked = { ...before, insurance_document_id: 'd-created' };
    const created = document({ id: 'd-created', title: '2018 Toyota Corolla insurance' });
    let resolveDocument!: (response: Response) => void;
    let serverCar = before;
    mockAuthenticatedFetch.mockImplementation(async (path, init) => {
      if (path === '/cars/c1' && init?.method === 'PUT') {
        serverCar = linked;
        return jsonResponse(linked);
      }
      if (path.startsWith('/cars')) {
        return jsonResponse([serverCar]);
      }
      if (path.startsWith('/documents/')) {
        return new Promise<Response>((resolve) => { resolveDocument = resolve; });
      }
      return jsonResponse([]);
    });
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText('Select Car 2018 Toyota Corolla')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Select Car 2018 Toyota Corolla'));
    fireEvent.press(screen.getByLabelText('Edit Car'));
    fireEvent.press(screen.getByLabelText('Edit create insurance document'));
    fireEvent.press(screen.getByLabelText('Submit mocked document create'));
    fireEvent.press(screen.getByLabelText('Save Car'));
    await waitFor(() => expect(resolveDocument).toBeTruthy());

    // When the user opens a new edit and types before the refresh ends
    await waitFor(() => expect(screen.getByLabelText('Edit Car')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Edit Car'));
    fireEvent.changeText(screen.getByLabelText('Edit notes'), 'Typed during refresh');
    await act(async () => { resolveDocument(jsonResponse(created)); });

    // Then the new edit form and its text stay
    await waitFor(() => expect(screen.getByText(/updated\./)).toBeTruthy());
    expect(screen.getByLabelText('Edit notes').props.value).toBe('Typed during refresh');
  });

  it('Scenario: Inactive Car blocks create and link change', async () => {
    const inactive = car({
      id: 'c-in',
      make: 'Kia',
      model: 'Soul',
      year: 2016,
      active: false,
      insurance_document_id: 'd1',
      deactivated_at: '2026-02-01T00:00:00Z',
    });
    const existing = document({ id: 'd1', title: 'Old insurance' });
    mockAuthenticatedFetch.mockImplementation(async (path) => {
      if (
        typeof path === 'string' &&
        path.includes('include_inactive=true')
      ) {
        return jsonResponse([inactive]);
      }
      if (typeof path === 'string' && path.startsWith('/cars')) {
        return jsonResponse([]);
      }
      if (typeof path === 'string' && path.startsWith('/documents')) {
        return jsonResponse([existing]);
      }
      return jsonResponse([]);
    });
    renderPanel();
    await waitFor(() => {
      expect(screen.getByLabelText('Include inactive Cars')).toBeTruthy();
    });
    fireEvent(screen.getByLabelText('Include inactive Cars'), 'valueChange', true);
    await waitFor(() => {
      expect(
        screen.getByLabelText('Select inactive Car 2016 Kia Soul')
      ).toBeTruthy();
    });
    fireEvent.press(screen.getByLabelText('Select inactive Car 2016 Kia Soul'));

    expect(screen.queryByLabelText('Create insurance document')).toBeNull();
    expect(screen.queryByLabelText('Create registration document')).toBeNull();
    expect(screen.queryByLabelText('Edit Car')).toBeNull();
    expect(
      screen.getByLabelText('Linked insurance document Old insurance')
    ).toBeTruthy();
  });
});
