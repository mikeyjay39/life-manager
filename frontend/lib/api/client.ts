import { API_BASE_URL, API_V1_PREFIX } from '@/constants/config';

const DEFAULT_AUTH_ERROR_STATUSES = [401, 403];

function normalizeV1Path(path: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`;

  if (suffix.startsWith('/api/v1/')) {
    return `/life-manager${suffix}`;
  }

  if (suffix.startsWith(API_V1_PREFIX)) {
    return suffix;
  }

  return `${API_V1_PREFIX}${suffix}`;
}

/** Build a root-relative v1 API path (e.g. `/life-manager/api/v1/documents`). */
export function apiV1(path: string): string {
  return normalizeV1Path(path);
}

/** Resolve a v1 path to a full URL (or root-relative when API_BASE_URL is empty). */
export function resolveApiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  const pathOnly = normalizeV1Path(path);
  if (!API_BASE_URL) {
    return pathOnly;
  }

  return `${API_BASE_URL.replace(/\/$/, '')}${pathOnly}`;
}

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
 * Accepts v1-relative paths such as `/auth/login` or `/documents`.
 */
export async function apiFetch(
  path: string,
  options: ApiFetchOptions = {}
): Promise<Response> {
  const {
    onUnauthorized,
    authErrorStatuses = DEFAULT_AUTH_ERROR_STATUSES,
    ...fetchOptions
  } = options;
  const response = await fetch(resolveApiUrl(path), fetchOptions);

  if (onUnauthorized && authErrorStatuses.includes(response.status)) {
    await onUnauthorized();
  }

  return response;
}

/**
 * Authenticated fetch wrapper that adds Bearer token and handles auth errors.
 */
export async function authenticatedFetch(
  path: string,
  options: AuthenticatedFetchOptions
): Promise<Response> {
  const {
    token,
    onUnauthorized,
    authErrorStatuses,
    headers = {},
    ...fetchOptions
  } = options;

  return apiFetch(path, {
    ...fetchOptions,
    onUnauthorized,
    authErrorStatuses,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

export function createAuthenticatedClient(
  token: string,
  onUnauthorized?: () => void | Promise<void>
) {
  return async (path: string, options: RequestInit = {}) => {
    return authenticatedFetch(path, {
      ...options,
      token,
      onUnauthorized,
    });
  };
}
