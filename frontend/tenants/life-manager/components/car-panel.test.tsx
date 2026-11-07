import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { useAuth } from '@/contexts/AuthContext';
import { authenticatedFetch } from '@/lib/api/client';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';
import type { CarDto, DocumentDto } from '@/lib/api/types';

import CarPanel, {
  carDisplayLabel,
  parseCarDto,
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

/** Default GET /cars then GET /documents (order may vary with parallel loads). */
function mockInitialLoads(cars: CarDto[] = [], docs: DocumentDto[] = []) {
  mockAuthenticatedFetch.mockImplementation(async (path: string) => {
    if (typeof path === 'string' && path.startsWith('/cars')) {
      return jsonResponse(cars);
    }
    if (typeof path === 'string' && path.startsWith('/documents')) {
      return jsonResponse(docs);
    }
    return jsonResponse([]);
  });
}

describe('unicodeScalarLength', () => {
  it('counts Unicode scalars like Rust chars().count()', () => {
    expect(unicodeScalarLength('Toyota')).toBe(6);
    expect(unicodeScalarLength('😀'.repeat(100)).length).not.toBe(100);
    expect(unicodeScalarLength('😀'.repeat(100))).toBe(100);
  });
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

describe('CarPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    await waitFor(() => {
      expect(
        screen.getByLabelText('Select registration document Registration 2018')
      ).toBeTruthy();
    });
    fireEvent.press(
      screen.getByLabelText('Select registration document Registration 2018')
    );
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
    expect(screen.getByLabelText('No Car selected')).toBeTruthy();
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
});
