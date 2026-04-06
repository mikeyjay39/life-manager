import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import DocumentList from './document-list';
import { useAuth } from '@/contexts/AuthContext';
import { authenticatedFetch } from '@/lib/api/client';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  authenticatedFetch: vi.fn(),
}));

const mockUseAuth = vi.mocked(useAuth);
const mockAuthenticatedFetch = vi.mocked(authenticatedFetch);

function defaultAuth(overrides: Partial<ReturnType<typeof useAuth>> = {}) {
  return {
    token: 'tok',
    handleUnauthorized: vi.fn(),
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  };
}

describe('DocumentList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue(defaultAuth());
    mockAuthenticatedFetch.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
  });

  it('shows sign in message when there is no token', () => {
    mockUseAuth.mockReturnValue(defaultAuth({ token: null, isAuthenticated: false }));
    render(<DocumentList />);
    expect(screen.getByText('Sign in to see your documents.')).toBeTruthy();
  });

  it('loads and lists document titles', async () => {
    mockAuthenticatedFetch.mockResolvedValue(
      new Response(
        JSON.stringify([
          { id: '1', title: 'Alpha', content: 'c1' },
          { id: '2', title: 'Beta', content: 'c2' },
        ]),
        { status: 200 }
      )
    );
    render(<DocumentList />);
    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeTruthy();
    });
    expect(screen.getByText('Beta')).toBeTruthy();
    expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
      '/api/v1/documents',
      expect.objectContaining({ method: 'GET', token: 'tok' })
    );
  });

  it('shows error when fetch fails', async () => {
    mockAuthenticatedFetch.mockResolvedValue(new Response('oops', { status: 500 }));
    render(<DocumentList />);
    await waitFor(() => {
      expect(screen.getByText(/500/)).toBeTruthy();
    });
  });

  it('shows empty state when array is empty', async () => {
    mockAuthenticatedFetch.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    render(<DocumentList />);
    await waitFor(() => {
      expect(screen.getByText('No documents yet.')).toBeTruthy();
    });
  });

  it('opens modal with title and content when a row is pressed', async () => {
    mockAuthenticatedFetch.mockResolvedValue(
      new Response(JSON.stringify([{ id: '1', title: 'Doc A', content: 'Body text' }]), { status: 200 })
    );
    render(<DocumentList />);
    await waitFor(() => {
      expect(screen.getByText('Doc A')).toBeTruthy();
    });
    fireEvent.press(screen.getByLabelText('Open document Doc A'));
    expect(screen.getByText('Body text')).toBeTruthy();
    fireEvent.press(screen.getByText('Close'));
  });
});
