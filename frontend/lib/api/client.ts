import { API_BASE_URL } from '@/constants/config';

const DEFAULT_AUTH_ERROR_STATUSES = [401, 403];

type ApiFetchOptions = RequestInit & {
  onUnauthorized?: () => void | Promise<void>;
  authErrorStatuses?: number[];
};

type AuthenticatedFetchOptions = RequestInit & {
  token: string;
  onUnauthorized?: () => void | Promise<void>;
  authErrorStatuses?: number[];
};

/**
 * Shared fetch wrapper that supports auth error interception.
 */
export async function apiFetch(
  url: string,
  options: ApiFetchOptions = {}
): Promise<Response> {
  const {
    onUnauthorized,
    authErrorStatuses = DEFAULT_AUTH_ERROR_STATUSES,
    ...fetchOptions
  } = options;
  const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;
  const response = await fetch(fullUrl, fetchOptions);

  if (onUnauthorized && authErrorStatuses.includes(response.status)) {
    await onUnauthorized();
  }

  return response;
}

/**
 * Authenticated fetch wrapper that adds Bearer token and handles auth errors.
 */
export async function authenticatedFetch(
  url: string,
  options: AuthenticatedFetchOptions
): Promise<Response> {
  const {
    token,
    onUnauthorized,
    authErrorStatuses,
    headers = {},
    ...fetchOptions
  } = options;

  return apiFetch(url, {
    ...fetchOptions,
    onUnauthorized,
    authErrorStatuses,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

export function createAuthenticatedClient(
  token: string,
  onUnauthorized?: () => void | Promise<void>
) {
  return async (url: string, options: RequestInit = {}) => {
    return authenticatedFetch(url, {
      ...options,
      token,
      onUnauthorized,
    });
  };
}
