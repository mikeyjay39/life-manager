import { describe, expect, it } from 'vitest';
import {
  buildCreateDocumentCommand,
  documentFromDraft,
  extractionBannerMessage,
  formatIsoDateForInput,
  mergeExtractedFields,
  parseCreatedDocumentResponse,
  parseExtractedFields,
  parseExtractionLimits,
  parseOptionalDateInput,
  parseTags,
  readApiErrorMessage,
  storageRefFromProtonUpload,
  type DocumentFormInput,
} from './document-create-form-utils';
import type { ExtractedDocumentFieldsDto } from '@/lib/api/types';

describe('parseOptionalDateInput', () => {
  it('returns null for empty or whitespace input', () => {
    expect(parseOptionalDateInput('')).toEqual({ ok: true, value: null });
    expect(parseOptionalDateInput('   ')).toEqual({ ok: true, value: null });
  });

  it('converts valid YYYY-MM-DD to naive datetime string', () => {
    expect(parseOptionalDateInput('2024-06-01')).toEqual({
      ok: true,
      value: '2024-06-01T00:00:00',
    });
    expect(parseOptionalDateInput(' 2026-12-31 ')).toEqual({
      ok: true,
      value: '2026-12-31T00:00:00',
    });
  });

  it('rejects invalid format or calendar dates', () => {
    expect(parseOptionalDateInput('06/01/2024')).toEqual({ ok: false });
    expect(parseOptionalDateInput('2024-6-1')).toEqual({ ok: false });
    expect(parseOptionalDateInput('2024-13-01')).toEqual({ ok: false });
    expect(parseOptionalDateInput('2024-02-30')).toEqual({ ok: false });
    expect(parseOptionalDateInput('not-a-date')).toEqual({ ok: false });
  });
});

describe('formatIsoDateForInput', () => {
  it('returns empty string for null or undefined', () => {
    expect(formatIsoDateForInput(null)).toBe('');
    expect(formatIsoDateForInput(undefined)).toBe('');
  });

  it('slices ISO datetime to YYYY-MM-DD', () => {
    expect(formatIsoDateForInput('2024-06-01T00:00:00')).toBe('2024-06-01');
  });
});

describe('parseTags', () => {
  it('splits comma-separated tags and trims empty entries', () => {
    expect(parseTags('tax, 2024, , finance')).toEqual(['tax', '2024', 'finance']);
  });
});

describe('parseCreatedDocumentResponse', () => {
  it('returns DocumentDto with id and title when body is valid', () => {
    // Given a create response with id and title
    const body = JSON.stringify({
      id: '550e8400-e29b-41d4-a716-446655440000',
      title: 'Policy',
      content: 'body',
      tags: ['car'],
      created_at: '2026-01-01T00:00:00',
      issued_date: null,
      expire_date: null,
      storage: null,
    });
    // When parsed
    const parsed = parseCreatedDocumentResponse(body);
    // Then id and title are present
    expect(parsed).toMatchObject({
      id: '550e8400-e29b-41d4-a716-446655440000',
      title: 'Policy',
    });
  });

  it('returns null when JSON is invalid', () => {
    expect(parseCreatedDocumentResponse('not-json')).toBeNull();
  });

  it('returns null when id is missing or blank', () => {
    expect(parseCreatedDocumentResponse(JSON.stringify({ title: 'X' }))).toBeNull();
    expect(
      parseCreatedDocumentResponse(JSON.stringify({ id: '  ', title: 'X' }))
    ).toBeNull();
  });
});

describe('buildCreateDocumentCommand', () => {
  const validInput = {
    title: '  Insurance  ',
    content: ' Policy ',
    tagsInput: 'car, insurance, ',
    issuedDateInput: '2026-01-02',
    expireDateInput: '',
  };

  it('builds a trimmed payload with null storage', () => {
    expect(buildCreateDocumentCommand(validInput)).toEqual({
      ok: true,
      value: {
        title: 'Insurance',
        content: 'Policy',
        tags: ['car', 'insurance'],
        issued_date: '2026-01-02T00:00:00',
        expire_date: null,
        storage: null,
      },
    });
  });

  it('rejects a blank title or content', () => {
    const message = 'Please enter a title and content.';
    expect(buildCreateDocumentCommand({ ...validInput, title: ' ' })).toEqual({
      ok: false,
      message,
    });
    expect(buildCreateDocumentCommand({ ...validInput, content: '' })).toEqual({
      ok: false,
      message,
    });
  });

  it('rejects invalid issue and expire dates', () => {
    expect(
      buildCreateDocumentCommand({ ...validInput, issuedDateInput: '2026-13-01' })
    ).toEqual({ ok: false, message: 'Issue date must be in YYYY-MM-DD format.' });
    expect(
      buildCreateDocumentCommand({ ...validInput, expireDateInput: '01/02/2026' })
    ).toEqual({ ok: false, message: 'Expire date must be in YYYY-MM-DD format.' });
  });
});

describe('storageRefFromProtonUpload', () => {
  it('maps the upload result to the API storage reference', () => {
    expect(
      storageRefFromProtonUpload({
        provider: 'proton_drive',
        shareId: 'share-1',
        nodeId: 'node-1',
        filename: 'policy.pdf',
        mimeType: null,
      })
    ).toEqual({
      provider: 'proton_drive',
      share_id: 'share-1',
      node_id: 'node-1',
      filename: 'policy.pdf',
      mime_type: null,
    });
  });
});

describe('documentFromDraft', () => {
  it('copies the draft fields and uses the response id', () => {
    const storage = {
      provider: 'proton_drive',
      share_id: 'share',
      node_id: 'node',
      filename: 'insurance.pdf',
      mime_type: 'application/pdf',
    };

    const document = documentFromDraft(
      'doc-1',
      {
        title: 'Insurance',
        content: 'Policy',
        tags: ['Car'],
        issued_date: '2026-01-01T00:00:00',
        expire_date: null,
        storage,
      },
      new Date('2026-11-25T10:20:30.000Z')
    );

    expect(document).toEqual({
      id: 'doc-1',
      title: 'Insurance',
      content: 'Policy',
      tags: ['Car'],
      created_at: '2026-11-25T10:20:30.000',
      issued_date: '2026-01-01T00:00:00',
      expire_date: null,
      storage,
    });
  });

  it('keeps a null storage', () => {
    const document = documentFromDraft('doc-2', {
      title: 'Receipt',
      content: '',
      tags: [],
      issued_date: null,
      expire_date: null,
      storage: null,
    });

    expect(document.storage).toBeNull();
  });
});

const emptyForm: DocumentFormInput = {
  title: '',
  content: '',
  tagsInput: '',
  issuedDateInput: '',
  expireDateInput: '',
};

const fullExtraction: ExtractedDocumentFieldsDto = {
  title: 'Home insurance',
  content: 'Policy text',
  tags: ['insurance', 'home'],
  issued_date: '2025-01-01',
  expire_date: '2026-01-01',
};

describe('mergeExtractedFields', () => {
  it('given a typed title when all fields are extracted then keeps the title and fills 4 fields', () => {
    // Given a form with only the title typed
    const current = { ...emptyForm, title: 'My policy' };
    // When the extraction returns all fields
    const result = mergeExtractedFields(current, fullExtraction, '');
    // Then the title stays and the other 4 fields fill
    expect(result.filledCount).toBe(4);
    expect(result.next).toEqual({
      title: 'My policy',
      content: 'Policy text',
      tagsInput: 'insurance, home',
      issuedDateInput: '2025-01-01',
      expireDateInput: '2026-01-01',
    });
  });

  it('given an empty form when all fields are extracted then fills 5 fields', () => {
    const result = mergeExtractedFields(emptyForm, fullExtraction, '');
    expect(result.filledCount).toBe(5);
    expect(result.next.title).toBe('Home insurance');
  });

  it('given nothing is extracted then fills no field', () => {
    const result = mergeExtractedFields(
      emptyForm,
      { title: null, content: null, tags: [], issued_date: null, expire_date: null },
      ''
    );
    expect(result.filledCount).toBe(0);
    expect(result.next).toEqual(emptyForm);
  });

  it('given whitespace-only extracted values then does not fill them', () => {
    const result = mergeExtractedFields(
      emptyForm,
      { title: '  ', content: '\n', tags: [' ', ''], issued_date: ' ', expire_date: null },
      ''
    );
    expect(result.filledCount).toBe(0);
    expect(result.next).toEqual(emptyForm);
  });

  it('given whitespace-only current values then treats them as empty', () => {
    const result = mergeExtractedFields(
      { ...emptyForm, title: '   ' },
      { ...fullExtraction, content: null, tags: [], issued_date: null, expire_date: null },
      ''
    );
    expect(result.filledCount).toBe(1);
    expect(result.next.title).toBe('Home insurance');
  });

  it('given tags equal to the initial tags then fills the union of both', () => {
    // Given the Car prefill tag is still unchanged
    const current = { ...emptyForm, tagsInput: 'insurance' };
    // When the extraction returns tags
    const result = mergeExtractedFields(
      current,
      { ...fullExtraction, tags: ['Insurance', 'car'] },
      'insurance'
    );
    // Then the prefill tag stays first and duplicates go away
    expect(result.next.tagsInput).toBe('insurance, car');
    expect(result.filledCount).toBe(5);
  });

  it('given tags edited by the user then keeps them', () => {
    const current = { ...emptyForm, tagsInput: 'mine' };
    const result = mergeExtractedFields(current, fullExtraction, 'insurance');
    expect(result.next.tagsInput).toBe('mine');
    expect(result.filledCount).toBe(4);
  });

  it('given duplicate extracted tags then de-duplicates them case-insensitively', () => {
    const result = mergeExtractedFields(
      emptyForm,
      { ...fullExtraction, tags: ['Tax', ' tax ', 'TAX', '2024'] },
      ''
    );
    expect(result.next.tagsInput).toBe('Tax, 2024');
  });

  it('given initial tags that already hold every extracted tag then counts no tag change', () => {
    const current = { ...emptyForm, tagsInput: 'insurance' };
    const result = mergeExtractedFields(
      current,
      { title: null, content: null, tags: ['INSURANCE'], issued_date: null, expire_date: null },
      'insurance'
    );
    expect(result.next.tagsInput).toBe('insurance');
    expect(result.filledCount).toBe(0);
  });
});

describe('extractionBannerMessage', () => {
  it('uses the plural for more than one field', () => {
    expect(extractionBannerMessage('scan.jpg', 4)).toBe(
      'Filled 4 fields from scan.jpg. Review before you submit.'
    );
  });

  it('uses the singular for one field', () => {
    expect(extractionBannerMessage('scan.jpg', 1)).toBe(
      'Filled 1 field from scan.jpg. Review before you submit.'
    );
  });

  it('says no fields were found for zero', () => {
    expect(extractionBannerMessage('scan.jpg', 0)).toBe('No fields found in scan.jpg.');
  });
});

describe('readApiErrorMessage', () => {
  it('returns the backend message from a JSON body', () => {
    expect(readApiErrorMessage(JSON.stringify({ message: 'File is too large' }), 413)).toBe(
      'File is too large'
    );
  });

  it('falls back to the status when the body has no message', () => {
    expect(readApiErrorMessage('not json', 503)).toBe('Extraction failed (status 503).');
    expect(readApiErrorMessage(JSON.stringify({ message: '  ' }), 429)).toBe(
      'Extraction failed (status 429).'
    );
    expect(readApiErrorMessage('', 500)).toBe('Extraction failed (status 500).');
  });
});

describe('parseExtractionLimits', () => {
  it('returns the limits from a valid body', () => {
    const limits = {
      daily_limit_per_user: 20,
      remaining_today: 3,
      max_file_bytes: 10485760,
      max_pdf_pages: 5,
    };
    expect(parseExtractionLimits(JSON.stringify(limits))).toEqual(limits);
  });

  it('returns null for invalid JSON or missing numbers', () => {
    expect(parseExtractionLimits('nope')).toBeNull();
    expect(parseExtractionLimits(JSON.stringify({ remaining_today: 1 }))).toBeNull();
  });
});

describe('parseExtractedFields', () => {
  it('returns the fields from a valid body', () => {
    expect(parseExtractedFields(JSON.stringify(fullExtraction))).toEqual(fullExtraction);
  });

  it('maps missing or non-string values to null and drops non-string tags', () => {
    expect(
      parseExtractedFields(JSON.stringify({ title: 5, tags: ['a', 3], issued_date: null }))
    ).toEqual({ title: null, content: null, tags: ['a'], issued_date: null, expire_date: null });
  });

  it('returns null for invalid JSON or a non-object body', () => {
    expect(parseExtractedFields('nope')).toBeNull();
    expect(parseExtractedFields('[]')).toBeNull();
    expect(parseExtractedFields('null')).toBeNull();
  });
});
