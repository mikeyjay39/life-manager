import type { DocumentDto } from '@/lib/api/types';

const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type ParseOptionalDateResult =
  | { ok: true; value: string | null }
  | { ok: false };

/**
 * Parses a create-document response body.
 * Returns null when JSON is invalid or id is missing — never invents an id.
 */
export function parseCreatedDocumentResponse(bodyText: string): DocumentDto | null {
  try {
    const raw = JSON.parse(bodyText) as unknown;
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    const d = raw as Record<string, unknown>;
    const id = typeof d.id === 'string' ? d.id.trim() : '';
    if (!id) {
      return null;
    }
    const title = typeof d.title === 'string' ? d.title : '';
    const storageRaw = d.storage as Record<string, unknown> | null | undefined;
    const storage =
      storageRaw && typeof storageRaw === 'object'
        ? {
            provider: String(storageRaw.provider ?? ''),
            share_id: String(storageRaw.share_id ?? ''),
            node_id: String(storageRaw.node_id ?? ''),
            filename: String(storageRaw.filename ?? ''),
            mime_type:
              storageRaw.mime_type != null ? String(storageRaw.mime_type) : null,
          }
        : null;

    return {
      id,
      title,
      content: typeof d.content === 'string' ? d.content : '',
      tags: Array.isArray(d.tags) ? d.tags.map(String) : [],
      created_at: typeof d.created_at === 'string' ? d.created_at : '',
      issued_date: d.issued_date != null ? String(d.issued_date) : null,
      expire_date: d.expire_date != null ? String(d.expire_date) : null,
      storage,
    };
  } catch {
    return null;
  }
}

export function parseOptionalDateInput(value: string): ParseOptionalDateResult {
  const trimmed = value.trim();
  if (trimmed === '') {
    return { ok: true, value: null };
  }

  if (!DATE_INPUT_PATTERN.test(trimmed)) {
    return { ok: false };
  }

  const [year, month, day] = trimmed.split('-').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    return { ok: false };
  }

  return { ok: true, value: `${trimmed}T00:00:00` };
}

/** Converts an ISO datetime string (or null) to YYYY-MM-DD for date inputs. */
export function formatIsoDateForInput(iso: string | null | undefined): string {
  if (!iso) {
    return '';
  }
  return iso.slice(0, 10);
}

export function parseTags(input: string): string[] {
  return input
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}
