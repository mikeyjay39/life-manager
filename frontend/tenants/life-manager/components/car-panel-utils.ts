import type {
  CarDto,
  CreateCarCommand,
  CreateDocumentCommand,
  DocumentDto,
} from '@/lib/api/types';
import { documentFromDraft } from './document-create-form-utils';

/** Count Unicode scalars (matches Rust `chars().count()`). */
export function unicodeScalarLength(value: string): number {
  return [...value].length;
}

export function parseCarDto(item: unknown): CarDto {
  const c = item as Record<string, unknown>;
  return {
    id: String(c.id ?? ''),
    display_name: c.display_name != null ? String(c.display_name) : null,
    make: String(c.make ?? ''),
    model: String(c.model ?? ''),
    year: Number(c.year ?? 0),
    vin: c.vin != null ? String(c.vin) : null,
    license_plate: c.license_plate != null ? String(c.license_plate) : null,
    notes: c.notes != null ? String(c.notes) : null,
    insurance_document_id:
      c.insurance_document_id != null ? String(c.insurance_document_id) : null,
    registration_document_id:
      c.registration_document_id != null
        ? String(c.registration_document_id)
        : null,
    active: Boolean(c.active),
    created_at: String(c.created_at ?? ''),
    updated_at: String(c.updated_at ?? ''),
    deactivated_at:
      c.deactivated_at != null ? String(c.deactivated_at) : null,
  };
}

/** Minimal Document parse for owned-document pickers (id + title). */
export function parseOwnedDocumentDto(item: unknown): DocumentDto {
  const d = item as Record<string, unknown>;
  const storage = d.storage as DocumentDto['storage'];
  return {
    id: String(d.id ?? ''),
    title: String(d.title ?? ''),
    content: String(d.content ?? ''),
    tags: Array.isArray(d.tags) ? d.tags.map(String) : [],
    created_at: String(d.created_at ?? ''),
    issued_date: d.issued_date != null ? String(d.issued_date) : null,
    expire_date: d.expire_date != null ? String(d.expire_date) : null,
    storage: storage && typeof storage === 'object' ? storage : null,
  };
}

/** Label for picker chips and headers. */
export function carDisplayLabel(car: CarDto): string {
  const name = car.display_name?.trim();
  if (name) {
    return name;
  }
  return `${car.year} ${car.make} ${car.model}`.trim();
}

export type CarDocumentLinkRole = 'insurance' | 'registration';

/** Draft label from open create/edit fields before Save. */
export function carFormDraftLabel(fields: {
  displayName: string;
  make: string;
  model: string;
  year: string;
}): string {
  const name = fields.displayName.trim();
  if (name) {
    return name;
  }
  const parts = [fields.year.trim(), fields.make.trim(), fields.model.trim()].filter(
    (part) => part.length > 0
  );
  return parts.length > 0 ? parts.join(' ') : 'Car';
}

/** Editable Document title prefill: `{label} insurance` / `{label} registration`. */
export function carDocumentPrefillTitle(
  carLabel: string,
  role: CarDocumentLinkRole
): string {
  const label = carLabel.trim() || 'Car';
  return `${label} ${role}`;
}

/** Editable Document tags prefill for a Car link role. */
export function carDocumentPrefillTags(role: CarDocumentLinkRole): string {
  return role;
}

export function yearMax(): number {
  return new Date().getFullYear() + 1;
}

/**
 * One Document field of the Car form: a link to an owned Document, or a new
 * Document that the Car write creates in the same transaction.
 */
export type CarDocumentLinkValue =
  | { kind: 'existing'; id: string }
  | { kind: 'new'; draft: CreateDocumentCommand };

export type CarDocumentLinks = Record<CarDocumentLinkRole, CarDocumentLinkValue | null>;

export type CarDocumentRequestFields = Pick<
  CreateCarCommand,
  | 'insurance_document_id'
  | 'registration_document_id'
  | 'new_insurance_document'
  | 'new_registration_document'
>;

const CAR_DOCUMENT_LINK_ROLES: readonly CarDocumentLinkRole[] = ['insurance', 'registration'];

export function carDocumentLinkFromId(id: string | null): CarDocumentLinkValue | null {
  return id ? { kind: 'existing', id } : null;
}

export function carDocumentLinksFromCar(car: CarDto): CarDocumentLinks {
  return {
    insurance: carDocumentLinkFromId(car.insurance_document_id),
    registration: carDocumentLinkFromId(car.registration_document_id),
  };
}

/** The title to show for a link. A link to a Document that is not loaded shows its id. */
export function carDocumentLinkTitle(
  link: CarDocumentLinkValue,
  titleById: ReadonlyMap<string, string>
): string {
  return link.kind === 'new' ? link.draft.title : titleById.get(link.id) ?? link.id;
}

/** The request field that creates a new Document for one role. */
export function newCarDocumentField(
  role: CarDocumentLinkRole,
  draft: CreateDocumentCommand
): Pick<CreateCarCommand, 'new_insurance_document' | 'new_registration_document'> {
  return role === 'insurance'
    ? { new_insurance_document: draft }
    : { new_registration_document: draft };
}

export function existingLinkId(link: CarDocumentLinkValue | null): string | null {
  return link?.kind === 'existing' ? link.id : null;
}

/**
 * Document fields for POST /cars and PUT /cars/{id}. A role with a new draft
 * sends a null id, because the API rejects a set id together with new_* for
 * the same role. Absent new_* means no new Document.
 */
export function carDocumentRequestFields(links: CarDocumentLinks): CarDocumentRequestFields {
  const { insurance, registration } = links;
  return {
    insurance_document_id: existingLinkId(insurance),
    registration_document_id: existingLinkId(registration),
    ...(insurance?.kind === 'new' ? newCarDocumentField('insurance', insurance.draft) : {}),
    ...(registration?.kind === 'new'
      ? newCarDocumentField('registration', registration.draft)
      : {}),
  };
}

/**
 * The Documents that a Car write created, for the roles that held a new draft.
 * Each one is built from its draft and the role id in the response.
 */
export function createdCarDocuments(car: CarDto, links: CarDocumentLinks): DocumentDto[] {
  return CAR_DOCUMENT_LINK_ROLES.flatMap((role) => {
    const link = links[role];
    if (link?.kind !== 'new') {
      return [];
    }
    const id =
      role === 'insurance' ? car.insurance_document_id : car.registration_document_id;
    return id ? [documentFromDraft(id, link.draft)] : [];
  });
}
