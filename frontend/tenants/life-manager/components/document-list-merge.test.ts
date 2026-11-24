import { describe, expect, it } from 'vitest';

import type { DocumentDto } from '@/lib/api/types';

import {
  type CreatedDocument,
  mergeCreatedDocuments,
  pruneCreatedDocuments,
} from './document-list-merge';

function documentDto(
  id: string,
  overrides: Partial<DocumentDto> = {}
): DocumentDto {
  return {
    id,
    title: `Title ${id}`,
    content: '',
    tags: [],
    created_at: '2026-11-24T00:00:00',
    issued_date: null,
    expire_date: null,
    storage: null,
    ...overrides,
  };
}

function created(
  id: string,
  createdSequence: number,
  overrides: Partial<DocumentDto> = {}
): CreatedDocument {
  return { document: documentDto(id, overrides), createdSequence };
}

const receiptStorage = {
  provider: 'proton_drive',
  share_id: 'share-1',
  node_id: 'node-1',
  filename: 'receipt.pdf',
  mime_type: 'application/pdf',
};

const ids = (documents: readonly DocumentDto[]) =>
  documents.map((document) => document.id);

const createdIds = (entries: readonly CreatedDocument[]) =>
  entries.map((entry) => entry.document.id);

describe('mergeCreatedDocuments', () => {
  it('returns the loaded list when nothing was created', () => {
    const loaded = [documentDto('a'), documentDto('b')];

    expect(mergeCreatedDocuments(loaded, [], 0)).toEqual(loaded);
  });

  it('returns the created Documents when the loaded list is empty', () => {
    const entries = [created('new-1', 1), created('new-2', 2)];

    expect(ids(mergeCreatedDocuments([], entries, 0))).toEqual([
      'new-1',
      'new-2',
    ]);
  });

  it('adds a Document created after the GET started when the GET omits it', () => {
    const loaded = [documentDto('a')];

    expect(ids(mergeCreatedDocuments(loaded, [created('new-1', 1)], 0))).toEqual(
      ['a', 'new-1']
    );
  });

  it('does not add a Document created before the GET started', () => {
    // The GET covers it; absence means the Document was deleted.
    const loaded = [documentDto('a')];

    expect(ids(mergeCreatedDocuments(loaded, [created('new-1', 1)], 1))).toEqual(
      ['a']
    );
  });

  it('keeps the loaded order and appends missing created Documents in create order', () => {
    const loaded = [documentDto('b'), documentDto('a')];
    const entries = [created('new-2', 1), created('new-1', 2)];

    expect(ids(mergeCreatedDocuments(loaded, entries, 0))).toEqual([
      'b',
      'a',
      'new-2',
      'new-1',
    ]);
  });

  it('uses the loaded entry when a created Document is already in the list', () => {
    const loadedCopy = documentDto('new-1', { title: 'Server title' });

    const merged = mergeCreatedDocuments(
      [documentDto('a'), loadedCopy],
      [created('new-1', 1, { title: 'Created title' })],
      0
    );

    expect(ids(merged)).toEqual(['a', 'new-1']);
    expect(merged[1]).toBe(loadedCopy);
  });

  it('does not add a created Document twice', () => {
    const entries = [created('new-1', 1), created('new-1', 2)];

    expect(ids(mergeCreatedDocuments([documentDto('a')], entries, 0))).toEqual([
      'a',
      'new-1',
    ]);
  });

  it('keeps storage metadata on loaded and created Documents', () => {
    const loadedStorage = {
      ...receiptStorage,
      filename: 'a.png',
      mime_type: 'image/png',
    };

    const merged = mergeCreatedDocuments(
      [documentDto('a', { storage: loadedStorage })],
      [created('new-1', 1, { storage: receiptStorage })],
      0
    );

    expect(merged[0].storage).toEqual(loadedStorage);
    expect(merged[1].storage).toEqual(receiptStorage);
  });

  it('does not change its inputs', () => {
    const loaded = [documentDto('a')];
    const entries = [created('new-1', 1)];

    mergeCreatedDocuments(loaded, entries, 0);

    expect(ids(loaded)).toEqual(['a']);
    expect(createdIds(entries)).toEqual(['new-1']);
  });
});

describe('pruneCreatedDocuments', () => {
  it('drops Documents created before a successful GET started, present or absent', () => {
    const entries = [
      created('listed', 1),
      created('deleted', 2),
      created('after-get', 3),
    ];

    expect(createdIds(pruneCreatedDocuments(entries, 2))).toEqual([
      'after-get',
    ]);
  });

  it('keeps every Document created after the GET started', () => {
    const entries = [created('new-1', 1), created('new-2', 2)];

    expect(createdIds(pruneCreatedDocuments(entries, 0))).toEqual([
      'new-1',
      'new-2',
    ]);
  });

  it('does not change its inputs', () => {
    const entries = [created('new-1', 1)];

    pruneCreatedDocuments(entries, 1);

    expect(createdIds(entries)).toEqual(['new-1']);
  });
});

describe('panel sequence with mergeCreatedDocuments and pruneCreatedDocuments', () => {
  // These cases follow the panel contract: the panel calls prune only after a
  // successful GET, and merges only a successful GET result.

  it('keeps a created receipt merged when a GET that started before the create succeeds', () => {
    const olderGetStarted = 0;
    let entries = [created('receipt', 1, { storage: receiptStorage })];

    const shown = mergeCreatedDocuments(
      [documentDto('a')],
      entries,
      olderGetStarted
    );
    entries = pruneCreatedDocuments(entries, olderGetStarted);

    expect(ids(shown)).toEqual(['a', 'receipt']);
    expect(shown[1].storage).toEqual(receiptStorage);
    expect(createdIds(entries)).toEqual(['receipt']);
  });

  it('keeps the created set through two failed GETs, then prunes on the next successful GET', () => {
    const olderGetStarted = 0;
    const failedGetStarted = 1;
    const entries = [created('receipt', 1, { storage: receiptStorage })];
    // GET N and retry GET N+1 both start at sequence 1 and fail. The panel
    // calls neither helper, so the created set stays as it is.
    const afterFailures = entries;

    // An older GET that started before the create then succeeds without the
    // receipt. The unpruned set still shows it.
    expect(
      ids(mergeCreatedDocuments([documentDto('a')], afterFailures, olderGetStarted))
    ).toEqual(['a', 'receipt']);
    // A prune on the failed GET would lose it: the defect this contract prevents.
    const wronglyPruned = pruneCreatedDocuments(entries, failedGetStarted);
    expect(
      ids(mergeCreatedDocuments([documentDto('a')], wronglyPruned, olderGetStarted))
    ).toEqual(['a']);

    const successfulGetStarted = 1;
    const loaded = [
      documentDto('a'),
      documentDto('receipt', { storage: receiptStorage }),
    ];
    const shown = mergeCreatedDocuments(
      loaded,
      afterFailures,
      successfulGetStarted
    );

    expect(ids(shown)).toEqual(['a', 'receipt']);
    expect(shown[1].storage).toEqual(receiptStorage);
    expect(pruneCreatedDocuments(afterFailures, successfulGetStarted)).toEqual(
      []
    );
  });

  it('does not re-add a created Document that is deleted before a later successful GET', () => {
    let entries = [created('receipt', 1)];

    const laterGetStarted = 1;
    const loadedWithoutDeleted = [documentDto('a')];
    const shown = mergeCreatedDocuments(
      loadedWithoutDeleted,
      entries,
      laterGetStarted
    );
    entries = pruneCreatedDocuments(entries, laterGetStarted);

    expect(ids(shown)).toEqual(['a']);
    expect(entries).toEqual([]);
    expect(ids(mergeCreatedDocuments(loadedWithoutDeleted, entries, 2))).toEqual(
      ['a']
    );
  });
});
