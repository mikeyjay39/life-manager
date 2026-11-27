import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { execInLifeManagerDev } from './docker';
import { e2eDbPath, e2eDbPathContainer } from './env';

const EXTRACTION_USAGE_FOR_DOCUMENT_OWNER_SQL = `
  SELECT COALESCE(SUM(u.count), 0) AS count
  FROM document_extraction_usage u
  JOIN documents d ON d.user_id = u.user_id
  WHERE d.id = ?
`;

/**
 * Return the total extraction usage count of the user who owns the Document.
 *
 * Agents and tests may only run SELECT on the e2e DB, so each path opens the
 * DB read-only. SUM covers a run that crosses UTC midnight (two usage rows).
 *
 * ```
 * Harness -> host E2E_DB_PATH : open read-only + SELECT
 * alt host file missing (docker-from-dev-container)
 *   Harness -> docker exec life_manager_dev : cat container DB
 *   Harness -> temp copy : open read-only + SELECT ; delete copy
 * end
 * alt both paths fail
 *   Harness -> throw with both errors
 * end
 * ```
 */
export function readExtractionUsageCount(documentId: string): number {
  const hostPath = e2eDbPath();
  if (fs.existsSync(hostPath)) {
    return countUsageInDbFile(hostPath, documentId);
  }
  return countUsageInContainerDb(documentId, hostPath);
}

function countUsageInDbFile(dbPath: string, documentId: string): number {
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

/**
 * The backend image has no sqlite3 CLI, so copy the DB file out with `cat`
 * and query the copy. The backend uses the default rollback journal, so the
 * main file holds every committed row.
 */
function countUsageInContainerDb(documentId: string, hostPath: string): number {
  const containerPath = e2eDbPathContainer();
  let dbBytes: Buffer;
  try {
    dbBytes = execInLifeManagerDev(['cat', containerPath]);
  } catch (error) {
    throw new Error(
      `Cannot read the e2e DB: no file at host E2E_DB_PATH ${hostPath}, ` +
        `and docker exec life_manager_dev cat ${containerPath} failed: ${String(error)}`
    );
  }
  const copyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-db-'));
  const copyPath = path.join(copyDir, 'e2e.db');
  try {
    fs.writeFileSync(copyPath, dbBytes);
    return countUsageInDbFile(copyPath, documentId);
  } finally {
    fs.rmSync(copyDir, { recursive: true, force: true });
  }
}
