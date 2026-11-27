import { DatabaseSync } from 'node:sqlite';

import { e2eDbPath } from './env';

const EXTRACTION_USAGE_FOR_DOCUMENT_OWNER_SQL = `
  SELECT COALESCE(SUM(u.count), 0) AS count
  FROM document_extraction_usage u
  JOIN documents d ON d.user_id = u.user_id
  WHERE d.id = ?
`;

/**
 * Return the total extraction usage count of the user who owns the Document.
 *
 * Agents and tests may only run SELECT on the e2e DB, so the DB opens
 * read-only. SUM covers a run that crosses UTC midnight (two usage rows).
 */
export function readExtractionUsageCount(documentId: string): number {
  const dbPath = e2eDbPath();
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
  } catch (error) {
    throw new Error(
      `Cannot open the e2e DB read-only at ${dbPath}: ${String(error)}`
    );
  }
  try {
    const row = db
      .prepare(EXTRACTION_USAGE_FOR_DOCUMENT_OWNER_SQL)
      .get(documentId) as { count: number | bigint } | undefined;
    return Number(row?.count ?? 0);
  } finally {
    db.close();
  }
}
