import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { useAuth } from '@/contexts/AuthContext';
import { authenticatedFetch } from '@/lib/api/client';
import { TenantTestProvider } from '@/lib/tenant/TenantContext';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';
import type { TenantModule } from '@/lib/tenant/types';
import { lifeManagerTenantMeta } from '@/tenants/life-manager/meta';
import DocumentManagerScreen from '@/tenants/life-manager/screens/DocumentManagerScreen';

vi.mock('@/components/ui/manager-scroll-view', () => ({
  ManagerScrollView: ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => (
    <>
      <Text>{title}</Text>
      {children}
    </>
  ),
}));

vi.mock('@/components/ui/icon-symbol', () => ({
  IconSymbol: () => null,
}));

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

vi.mock('@/contexts/ProtonConnectContext', () => ({
  useProtonConnect: vi.fn(() => ({
    isSupported: true,
    session: null,
    isConnecting: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
  })),
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

vi.mock('expo-document-picker', () => ({
  getDocumentAsync: vi.fn().mockResolvedValue({ canceled: true, assets: [] }),
}));

const mockUseAuth = vi.mocked(useAuth);
const mockAuthenticatedFetch = vi.mocked(authenticatedFetch);

const tenant: TenantModule = {
  ...lifeManagerTenantMeta,
  screens: {
    Home: () => null,
    Documents: DocumentManagerScreen,
  },
};

function renderDocumentManagerScreen() {
  return render(
    <TenantTestProvider tenant={tenant}>
      <TenantThemeTestProvider theme={defaultResolvedTheme}>
        <DocumentManagerScreen />
      </TenantThemeTestProvider>
    </TenantTestProvider>
  );
}

describe('DocumentManagerScreen', () => {
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

  it('shows Proton setup, create entry, and document list as distinct sections', async () => {
    // Given the Document Manager screen
    // When the screen renders
    renderDocumentManagerScreen();
    // Then shared section chrome separates Proton, create, and list
    expect(screen.getByText('Document Manager')).toBeTruthy();
    expect(screen.getByLabelText('Proton setup section')).toBeTruthy();
    expect(screen.getByText('Proton Drive')).toBeTruthy();
    expect(screen.getByLabelText('Connect Proton Drive')).toBeTruthy();
    expect(screen.getByLabelText('Create document section')).toBeTruthy();
    expect(screen.getByText('Create document')).toBeTruthy();
    expect(screen.getByLabelText('Add document')).toBeTruthy();
    expect(screen.getByLabelText('Document list section')).toBeTruthy();
    expect(screen.getByText('Documents')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByLabelText('Refresh documents')).toBeTruthy();
    });
  });

  it('keeps create collapsed until Add document when documents exist', async () => {
    // Given documents already exist
    mockAuthenticatedFetch.mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            title: 'Existing',
            content: 'Body',
            tags: [],
            created_at: '2024-01-01T00:00:00Z',
            issued_date: null,
            expire_date: null,
            storage: null,
          },
        ]),
        { status: 200 }
      )
    );
    // When I view Document Manager
    renderDocumentManagerScreen();
    await waitFor(() => {
      expect(screen.getByLabelText('Open document Existing')).toBeTruthy();
    });
    // Then the list is visible and create stays collapsed
    expect(screen.getByLabelText('Add document')).toBeTruthy();
    expect(screen.queryByLabelText('Document create form')).toBeNull();
    expect(screen.queryByPlaceholderText('Document title')).toBeNull();
    // And I can open Add document on demand
    fireEvent.press(screen.getByLabelText('Add document'));
    expect(screen.getByLabelText('Document create form')).toBeTruthy();
    expect(screen.getByPlaceholderText('Document title')).toBeTruthy();
    expect(screen.getByLabelText('Cancel')).toBeTruthy();
  });
});
