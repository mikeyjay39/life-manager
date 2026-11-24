import { authenticatedFetch } from '@/lib/api/client';
import { fetchDocumentById } from './fetch-document';

vi.mock('@/lib/api/client', () => ({
  authenticatedFetch: vi.fn(),
}));

const mockAuthenticatedFetch = vi.mocked(authenticatedFetch);

const documentBody = {
  id: 'doc-1',
  title: 'Insurance 2026',
  content: 'Policy',
  tags: ['car', 'insurance'],
  created_at: '2026-11-24T10:00:00',
  issued_date: null,
  expire_date: '2027-11-24T00:00:00',
  storage: {
    provider: 'proton_drive',
    share_id: 'share-1',
    node_id: 'node-1',
    filename: 'policy.pdf',
    mime_type: 'application/pdf',
  },
};

describe('fetchDocumentById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('given an owned Document when loaded then returns it with storage metadata', async () => {
    // Given the API returns the Document
    mockAuthenticatedFetch.mockResolvedValue(
      new Response(JSON.stringify(documentBody), { status: 200 })
    );
    // When it is loaded by id
    const document = await fetchDocumentById('doc-1', { token: 'test-token' });
    // Then the parsed DTO keeps the file name and file type
    expect(document).toEqual(documentBody);
    expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
      '/documents/doc-1',
      expect.objectContaining({ method: 'GET', token: 'test-token' })
    );
  });

  it('given an id with reserved characters when loaded then encodes it in the path', async () => {
    // Given an id that is not URL safe
    mockAuthenticatedFetch.mockResolvedValue(
      new Response(JSON.stringify(documentBody), { status: 200 })
    );
    // When it is loaded
    await fetchDocumentById('a/b?c', { token: 'test-token' });
    // Then the path holds the encoded id
    expect(mockAuthenticatedFetch.mock.calls[0][0]).toBe('/documents/a%2Fb%3Fc');
  });

  it('given a 404 when loaded then throws with status and body', async () => {
    // Given the Document is not found
    mockAuthenticatedFetch.mockResolvedValue(new Response('not found', { status: 404 }));
    // When it is loaded
    // Then the error has the status and the body
    await expect(fetchDocumentById('doc-1', { token: 'test-token' })).rejects.toThrow(
      'Request failed (404): not found'
    );
  });

  it('given an unauthorized handler when loaded then passes it to the client', async () => {
    // Given a handler for auth errors
    const onUnauthorized = vi.fn();
    mockAuthenticatedFetch.mockResolvedValue(
      new Response(JSON.stringify(documentBody), { status: 200 })
    );
    // When it is loaded
    await fetchDocumentById('doc-1', { token: 'test-token', onUnauthorized });
    // Then the client gets the handler
    expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
      '/documents/doc-1',
      expect.objectContaining({ onUnauthorized })
    );
  });
});
