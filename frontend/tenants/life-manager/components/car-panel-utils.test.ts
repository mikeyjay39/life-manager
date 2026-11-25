import type { CarDto, CreateDocumentCommand } from '@/lib/api/types';
import {
  carDocumentLinksFromCar,
  carDocumentLinkTitle,
  carDocumentRequestFields,
  createdCarDocuments,
  existingLinkId,
  newCarDocumentField,
} from './car-panel-utils';

const draft: CreateDocumentCommand = {
  title: 'New insurance',
  content: 'Policy',
  tags: ['insurance'],
  issued_date: null,
  expire_date: null,
  storage: null,
};

function savedCar(overrides: Partial<CarDto> = {}): CarDto {
  return {
    id: 'c1',
    display_name: null,
    make: 'Toyota',
    model: 'Corolla',
    year: 2018,
    vin: null,
    license_plate: null,
    notes: null,
    insurance_document_id: null,
    registration_document_id: null,
    active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deactivated_at: null,
    ...overrides,
  };
}

describe('carDocumentRequestFields', () => {
  it('sends existing ids and no new Document fields', () => {
    expect(
      carDocumentRequestFields({
        insurance: { kind: 'existing', id: 'd1' },
        registration: null,
      })
    ).toEqual({ insurance_document_id: 'd1', registration_document_id: null });
  });

  it('sends a null id together with the new Document for a draft role', () => {
    expect(
      carDocumentRequestFields({
        insurance: { kind: 'new', draft },
        registration: { kind: 'existing', id: 'd2' },
      })
    ).toEqual({
      insurance_document_id: null,
      registration_document_id: 'd2',
      new_insurance_document: draft,
    });
  });

  it('never sends a set id and a new Document for the same role', () => {
    const fields = carDocumentRequestFields({
      insurance: { kind: 'new', draft },
      registration: { kind: 'new', draft },
    });
    expect(fields.insurance_document_id).toBeNull();
    expect(fields.registration_document_id).toBeNull();
    expect(fields.new_insurance_document).toEqual(draft);
    expect(fields.new_registration_document).toEqual(draft);
  });
});

describe('newCarDocumentField', () => {
  it('names the field for the role', () => {
    expect(newCarDocumentField('insurance', draft)).toEqual({ new_insurance_document: draft });
    expect(newCarDocumentField('registration', draft)).toEqual({
      new_registration_document: draft,
    });
  });
});

describe('createdCarDocuments', () => {
  it('builds Documents only for roles that held a new draft', () => {
    const car = savedCar({ insurance_document_id: 'd-new', registration_document_id: 'd-old' });

    const documents = createdCarDocuments(car, {
      insurance: { kind: 'new', draft },
      registration: { kind: 'existing', id: 'd-old' },
    });

    expect(documents.map((d) => [d.id, d.title])).toEqual([['d-new', draft.title]]);
  });

  it('skips a draft role that the response does not link', () => {
    expect(
      createdCarDocuments(savedCar(), { insurance: { kind: 'new', draft }, registration: null })
    ).toEqual([]);
  });
});

describe('car document link values', () => {
  it('maps Car ids to existing links', () => {
    expect(carDocumentLinksFromCar(savedCar({ insurance_document_id: 'd1' }))).toEqual({
      insurance: { kind: 'existing', id: 'd1' },
      registration: null,
    });
  });

  it('shows the draft title, the loaded title, or the id', () => {
    const titles = new Map([['d1', 'Loaded policy']]);
    expect(carDocumentLinkTitle({ kind: 'new', draft }, titles)).toBe('New insurance');
    expect(carDocumentLinkTitle({ kind: 'existing', id: 'd1' }, titles)).toBe('Loaded policy');
    expect(carDocumentLinkTitle({ kind: 'existing', id: 'd9' }, titles)).toBe('d9');
  });

  it('gives an id only for an existing link', () => {
    expect(existingLinkId({ kind: 'existing', id: 'd1' })).toBe('d1');
    expect(existingLinkId({ kind: 'new', draft })).toBeNull();
    expect(existingLinkId(null)).toBeNull();
  });
});
