import { authenticatedFetch } from '@/lib/api/client';
import type { DocumentDto } from '@/lib/api/types';
import { parseDocumentDto } from './document-create-form-utils';

export type FetchDocumentOptions = {
  token: string;
  onUnauthorized?: () => void | Promise<void>;
};

/**
 * Loads one owned Document, for example after a Car or maintenance write
 * created it from an embedded payload.
 * Throws an Error with the status and body on a non-2xx response.
 */
export async function fetchDocumentById(
  id: string,
  { token, onUnauthorized }: FetchDocumentOptions
): Promise<DocumentDto> {
  const response = await authenticatedFetch(`/documents/${encodeURIComponent(id)}`, {
    method: 'GET',
    token,
    onUnauthorized,
  });
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(
      bodyText
        ? `Request failed (${response.status}): ${bodyText}`
        : `Request failed with status ${response.status}`
    );
  }
  return parseDocumentDto(JSON.parse(bodyText));
}
