import { apiBaseUrl } from '../helpers/env';

export type SeededDocument = {
  id: string;
  title: string;
  content: string;
};

/**
 * Sign in via API and return the JWT.
 * Manager e2e uses this only to seed data; the browser signs in separately.
 */
export async function loginForApi(
  email: string,
  password: string
): Promise<string> {
  const response = await fetch(
    `${apiBaseUrl()}/life-manager/api/v1/auth/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username: email, password }),
    }
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`login failed: ${response.status} ${body}`);
  }
  const data = (await response.json()) as { token?: string };
  if (!data.token) {
    throw new Error('login response missing token');
  }
  return data.token;
}

/**
 * Create an owned document via multipart JSON (no file, no Proton).
 *
 * ```
 * Harness -> POST /auth/login : JWT
 * Harness -> POST /documents/ multipart json only
 * Backend -> SQLite : save Document (storage null)
 * ```
 */
export async function seedOwnedDocument(options: {
  token: string;
  title?: string;
  content?: string;
}): Promise<SeededDocument> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const title = options.title ?? `e2e-doc-${stamp}`;
  const content = options.content ?? `e2e seed content ${stamp}`;

  const form = new FormData();
  form.append(
    'json',
    JSON.stringify({
      title,
      content,
      tags: ['e2e'],
      issued_date: null,
      expire_date: null,
      storage: null,
    })
  );

  const response = await fetch(
    `${apiBaseUrl()}/life-manager/api/v1/documents/`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.token}`,
        Accept: 'application/json',
      },
      body: form,
    }
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `seed document failed: ${response.status} ${body}. ` +
        'API seed must succeed before Document Manager list assertions.'
    );
  }

  const data = (await response.json()) as {
    id?: string;
    title?: string;
    content?: string;
  };
  if (!data.id || !data.title) {
    throw new Error(
      `seed document response incomplete: ${JSON.stringify(data)}`
    );
  }
  return {
    id: data.id,
    title: data.title,
    content: data.content ?? content,
  };
}
