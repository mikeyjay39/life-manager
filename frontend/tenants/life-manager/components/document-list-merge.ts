import type { DocumentDto } from '@/lib/api/types';

/**
 * A Document created in this form session.
 *
 * The panel owns one monotonic sequence counter. When a create finishes, the
 * panel increments the counter and records the new value as
 * `createdSequence`. When a GET /documents starts, the panel records the
 * current value as that GET's `getStartedSequence`. So a Document was created
 * after a GET started exactly when `createdSequence > getStartedSequence`.
 */
export type CreatedDocument = {
  document: DocumentDto;
  createdSequence: number;
};

function createdAfterGetStarted(
  created: CreatedDocument,
  getStartedSequence: number
): boolean {
  return created.createdSequence > getStartedSequence;
}

/**
 * Adds Documents created after a GET /documents started to its result.
 *
 * Such a GET can return without them. A Document created before the GET
 * started is not added: the GET is the source of truth for it, so a Document
 * deleted since then stays out. The loaded list keeps its order, and a loaded
 * entry wins on an id match. GET /documents sorts by title, so no position in
 * that order is correct for a new Document. Added Documents go after the
 * list in create order.
 */
export function mergeCreatedDocuments(
  loaded: DocumentDto[],
  created: readonly CreatedDocument[],
  getStartedSequence: number
): DocumentDto[] {
  const seenIds = new Set(loaded.map((document) => document.id));
  const missing: DocumentDto[] = [];
  for (const entry of created) {
    if (!createdAfterGetStarted(entry, getStartedSequence)) {
      continue;
    }
    if (seenIds.has(entry.document.id)) {
      continue;
    }
    seenIds.add(entry.document.id);
    missing.push(entry.document);
  }
  return [...loaded, ...missing];
}

/**
 * Returns the created Documents that a successful GET /documents did not
 * cover: the ones created after that GET started.
 *
 * Call it only after a successful GET. A failed GET covers nothing, so the
 * panel must keep the whole created set. Otherwise a create followed by two
 * failed GETs drops the Document, and its linked title shows as unavailable.
 * For the same reason, do not call `mergeCreatedDocuments` with a failed
 * GET's sequence: it skips Documents created before that GET started.
 */
export function pruneCreatedDocuments(
  created: readonly CreatedDocument[],
  getStartedSequence: number
): CreatedDocument[] {
  return created.filter((entry) =>
    createdAfterGetStarted(entry, getStartedSequence)
  );
}
