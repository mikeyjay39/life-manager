import type {
  CreateDocumentCommand,
  DocumentDto,
  DocumentStorageRefDto,
} from '@/lib/api/types';
import type { ProtonStorageUploadResult } from '@/lib/proton-drive/types';

const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type ParseOptionalDateResult =
  | { ok: true; value: string | null }
  | { ok: false };

/** Parses one Document from a GET /documents or PUT /documents/{id} response. */
export function parseDocumentDto(item: unknown): DocumentDto {
  const d = item as Record<string, unknown>;
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
    id: String(d.id ?? ''),
    title: String(d.title ?? ''),
    content: String(d.content ?? ''),
    tags: Array.isArray(d.tags) ? d.tags.map(String) : [],
    created_at: String(d.created_at ?? ''),
    issued_date: d.issued_date != null ? String(d.issued_date) : null,
    expire_date: d.expire_date != null ? String(d.expire_date) : null,
    storage,
  };
}

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

/** Raw text values of the Document create form. */
export type DocumentFormInput = {
  title: string;
  content: string;
  tagsInput: string;
  issuedDateInput: string;
  expireDateInput: string;
};

export type BuildCreateDocumentCommandResult =
  | { ok: true; value: CreateDocumentCommand }
  | { ok: false; message: string };

/**
 * Validates the form text and builds the create payload with `storage: null`.
 * The caller sets `storage` after a Proton upload.
 */
export function buildCreateDocumentCommand(
  input: DocumentFormInput
): BuildCreateDocumentCommandResult {
  const title = input.title.trim();
  const content = input.content.trim();
  if (!title || !content) {
    return { ok: false, message: 'Please enter a title and content.' };
  }

  const issuedDate = parseOptionalDateInput(input.issuedDateInput);
  if (!issuedDate.ok) {
    return { ok: false, message: 'Issue date must be in YYYY-MM-DD format.' };
  }

  const expireDate = parseOptionalDateInput(input.expireDateInput);
  if (!expireDate.ok) {
    return { ok: false, message: 'Expire date must be in YYYY-MM-DD format.' };
  }

  return {
    ok: true,
    value: {
      title,
      content,
      tags: parseTags(input.tagsInput),
      issued_date: issuedDate.value,
      expire_date: expireDate.value,
      storage: null,
    },
  };
}

/** Maps a Proton Drive upload result to the API storage reference. */
export function storageRefFromProtonUpload(
  upload: ProtonStorageUploadResult
): DocumentStorageRefDto {
  return {
    provider: upload.provider,
    share_id: upload.shareId,
    node_id: upload.nodeId,
    filename: upload.filename,
    mime_type: upload.mimeType,
  };
}
