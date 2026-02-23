import { API_BASE_URL } from '@/constants/config';

type AuthenticatedFetchOptions = RequestInit & {
  token: string;
  onUnauthorized?: () => void;
};

/**
 * Authenticated fetch wrapper that adds Bearer token and handles 401 responses.
 * 
 * @param url - The URL to fetch (can be relative to API_BASE_URL or absolute)
 * @param options - Fetch options plus token and onUnauthorized callback
 * @returns Promise<Response>
 */
export async function authenticatedFetch(
  url: string,
  options: AuthenticatedFetchOptions
): Promise<Response> {
  const { token, onUnauthorized, headers = {}, ...fetchOptions } = options;

  const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;

  const response = await fetch(fullUrl, {
    ...fetchOptions,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...headers,
    },
  });

  if (response.status === 401 && onUnauthorized) {
    onUnauthorized();
  }

  return response;
}

/**
 * Hook-friendly version for use in components.
 * Usage:
 * 
 * const { token, logout } = useAuth();
 * const client = useAuthenticatedFetch();
 * 
 * const response = await client('/api/v1/protected-endpoint', {
 *   method: 'GET',
 * });
 */
export function createAuthenticatedClient(token: string, onUnauthorized?: () => void) {
  return async (url: string, options: RequestInit = {}) => {
    return authenticatedFetch(url, {
      ...options,
      token,
      onUnauthorized,
    });
  };
}
