import type {
  CreateDoctorVisitCommand,
  DoctorVisitDto,
  UpdateDoctorVisitCommand,
} from '@/lib/api/types';

export const PROVIDER_NAME_MAX_LEN = 100;
export const REASON_MAX_LEN = 2000;
export const NOTES_MAX_LEN = 2000;

export type DoctorVisitFormInput = {
  visitedOn: string;
  providerName: string;
  reason: string;
  notes: string;
};

export function unicodeScalarLength(value: string): number {
  return [...value].length;
}

export function emptyDoctorVisitForm(visitedOn = ''): DoctorVisitFormInput {
  return {
    visitedOn,
    providerName: '',
    reason: '',
    notes: '',
  };
}

export function formFromDoctorVisitDto(visit: DoctorVisitDto): DoctorVisitFormInput {
  return {
    visitedOn: visit.visited_on,
    providerName: visit.provider_name ?? '',
    reason: visit.reason ?? '',
    notes: visit.notes ?? '',
  };
}

function normalizeOptionalText(
  raw: string,
  field: string,
  maxLen: number
): { ok: true; value: string | null } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { ok: true, value: null };
  }
  if (unicodeScalarLength(trimmed) > maxLen) {
    return {
      ok: false,
      error: `${field} must be at most ${maxLen} characters.`,
    };
  }
  return { ok: true, value: trimmed };
}

function validateVisitFields(
  form: DoctorVisitFormInput
):
  | {
      ok: true;
      visited_on: string;
      provider_name: string | null;
      reason: string | null;
      notes: string | null;
    }
  | { ok: false; error: string } {
  const visitedOn = form.visitedOn.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(visitedOn)) {
    return { ok: false, error: 'Visit date must be in YYYY-MM-DD format.' };
  }

  const provider = normalizeOptionalText(
    form.providerName,
    'Provider name',
    PROVIDER_NAME_MAX_LEN
  );
  if (!provider.ok) {
    return provider;
  }
  const reason = normalizeOptionalText(form.reason, 'Reason', REASON_MAX_LEN);
  if (!reason.ok) {
    return reason;
  }
  const notes = normalizeOptionalText(form.notes, 'Notes', NOTES_MAX_LEN);
  if (!notes.ok) {
    return notes;
  }

  if (
    provider.value === null &&
    reason.value === null &&
    notes.value === null
  ) {
    return {
      ok: false,
      error: 'Enter a provider name, reason, or notes.',
    };
  }

  return {
    ok: true,
    visited_on: visitedOn,
    provider_name: provider.value,
    reason: reason.value,
    notes: notes.value,
  };
}

export function buildCreateDoctorVisitCommand(
  healthMemberId: string,
  form: DoctorVisitFormInput
):
  | { ok: true; command: CreateDoctorVisitCommand }
  | { ok: false; error: string } {
  const fields = validateVisitFields(form);
  if (!fields.ok) {
    return fields;
  }
  return {
    ok: true,
    command: {
      health_member_id: healthMemberId,
      visited_on: fields.visited_on,
      provider_name: fields.provider_name,
      reason: fields.reason,
      notes: fields.notes,
    },
  };
}

export function buildUpdateDoctorVisitCommand(
  form: DoctorVisitFormInput
):
  | { ok: true; command: UpdateDoctorVisitCommand }
  | { ok: false; error: string } {
  const fields = validateVisitFields(form);
  if (!fields.ok) {
    return fields;
  }
  return {
    ok: true,
    command: {
      visited_on: fields.visited_on,
      provider_name: fields.provider_name,
      reason: fields.reason,
      notes: fields.notes,
    },
  };
}

export function parseDoctorVisitDto(raw: unknown): DoctorVisitDto {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid DoctorVisitDto');
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== 'string' || typeof obj.health_member_id !== 'string') {
    throw new Error('Invalid DoctorVisitDto id fields');
  }
  if (typeof obj.visited_on !== 'string') {
    throw new Error('Invalid DoctorVisitDto visited_on');
  }
  return {
    id: obj.id,
    health_member_id: obj.health_member_id,
    visited_on: obj.visited_on,
    provider_name:
      obj.provider_name === null || obj.provider_name === undefined
        ? null
        : String(obj.provider_name),
    reason:
      obj.reason === null || obj.reason === undefined
        ? null
        : String(obj.reason),
    notes:
      obj.notes === null || obj.notes === undefined ? null : String(obj.notes),
    created_at: String(obj.created_at ?? ''),
    updated_at: String(obj.updated_at ?? ''),
  };
}
