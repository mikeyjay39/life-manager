import type {
  CarMaintenanceEventDto,
  CreateCarMaintenanceEventCommand,
  UpdateCarMaintenanceEventCommand,
} from '@/lib/api/types';
import { formatUsdFromCents } from '@/lib/format/display';

export const TITLE_MAX_LEN = 100;
export const NOTES_MAX_LEN = 2000;

/** Wire values for `event_type` (matches API / DB). */
export const CAR_MAINTENANCE_EVENT_TYPES = [
  'oil_change',
  'tire',
  'brakes',
  'service',
  'repair',
  'other',
] as const;

export type CarMaintenanceEventTypeValue =
  (typeof CAR_MAINTENANCE_EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<CarMaintenanceEventTypeValue, string> = {
  oil_change: 'Oil change',
  tire: 'Tire',
  brakes: 'Brakes',
  service: 'Service',
  repair: 'Repair',
  other: 'Other',
};

export type CarMaintenanceFormInput = {
  occurredOn: string;
  eventType: CarMaintenanceEventTypeValue;
  odometerMiles: string;
  costDollars: string;
  title: string;
  notes: string;
  documentId: string | null;
};

export function unicodeScalarLength(value: string): number {
  return [...value].length;
}

export function emptyCarMaintenanceForm(
  occurredOn = ''
): CarMaintenanceFormInput {
  return {
    occurredOn,
    eventType: 'oil_change',
    odometerMiles: '',
    costDollars: '',
    title: '',
    notes: '',
    documentId: null,
  };
}

/** Format API cents for the cost field (blank when unset). Fixed decimals for edit. */
export function formatCostCentsAsDollars(costCents: number | null): string {
  if (costCents == null) {
    return '';
  }
  return (costCents / 100).toFixed(2);
}

/** Display cost in history when set (locale USD from cents). */
export function formatCostCentsForDisplay(costCents: number | null): string | null {
  return formatUsdFromCents(costCents);
}

/**
 * Parse a dollars string into integer cents.
 * Blank → null. Rejects negatives and non-numeric input.
 */
export function parseCostDollarsToCents(
  raw: string
):
  | { ok: true; value: number | null }
  | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { ok: true, value: null };
  }
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return {
      ok: false,
      error: 'Cost must be a non-negative dollar amount (e.g. 59.99).',
    };
  }
  const [wholePart, fracPart = ''] = trimmed.split('.');
  const dollars = Number(wholePart);
  const centsPart = (fracPart + '00').slice(0, 2);
  const cents = dollars * 100 + Number(centsPart);
  if (!Number.isSafeInteger(cents) || cents < 0) {
    return { ok: false, error: 'Cost is out of range.' };
  }
  return { ok: true, value: cents };
}

export function formFromCarMaintenanceEventDto(
  event: CarMaintenanceEventDto
): CarMaintenanceFormInput {
  const eventType = CAR_MAINTENANCE_EVENT_TYPES.includes(
    event.event_type as CarMaintenanceEventTypeValue
  )
    ? (event.event_type as CarMaintenanceEventTypeValue)
    : 'other';
  return {
    occurredOn: event.occurred_on,
    eventType,
    odometerMiles:
      event.odometer_miles != null ? String(event.odometer_miles) : '',
    costDollars: formatCostCentsAsDollars(event.cost_cents),
    title: event.title ?? '',
    notes: event.notes ?? '',
    documentId: event.document_id,
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

function parseOdometerMiles(
  raw: string
):
  | { ok: true; value: number | null }
  | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { ok: true, value: null };
  }
  if (!/^\d+$/.test(trimmed)) {
    return {
      ok: false,
      error: 'Odometer miles must be a whole number >= 0.',
    };
  }
  const miles = Number(trimmed);
  if (!Number.isSafeInteger(miles) || miles < 0) {
    return {
      ok: false,
      error: 'Odometer miles must be a whole number >= 0.',
    };
  }
  return { ok: true, value: miles };
}

function isEventType(
  value: string
): value is CarMaintenanceEventTypeValue {
  return (CAR_MAINTENANCE_EVENT_TYPES as readonly string[]).includes(value);
}

type ValidatedMaintenanceFields = {
  occurred_on: string;
  event_type: CarMaintenanceEventTypeValue;
  odometer_miles: number | null;
  cost_cents: number | null;
  title: string | null;
  notes: string | null;
  document_id: string | null;
};

function validateMaintenanceFields(
  form: CarMaintenanceFormInput
):
  | { ok: true; value: ValidatedMaintenanceFields }
  | { ok: false; error: string } {
  const occurredOn = form.occurredOn.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
    return { ok: false, error: 'Date must be in YYYY-MM-DD format.' };
  }
  if (!isEventType(form.eventType)) {
    return { ok: false, error: 'Select a valid event type.' };
  }
  const odometer = parseOdometerMiles(form.odometerMiles);
  if (!odometer.ok) {
    return odometer;
  }
  const cost = parseCostDollarsToCents(form.costDollars);
  if (!cost.ok) {
    return cost;
  }
  const title = normalizeOptionalText(form.title, 'Title', TITLE_MAX_LEN);
  if (!title.ok) {
    return title;
  }
  const notes = normalizeOptionalText(form.notes, 'Notes', NOTES_MAX_LEN);
  if (!notes.ok) {
    return notes;
  }
  if (
    title.value === null &&
    notes.value === null &&
    odometer.value === null &&
    cost.value === null
  ) {
    return {
      ok: false,
      error: 'Enter a title, notes, odometer miles, or cost.',
    };
  }
  return {
    ok: true,
    value: {
      occurred_on: occurredOn,
      event_type: form.eventType,
      odometer_miles: odometer.value,
      cost_cents: cost.value,
      title: title.value,
      notes: notes.value,
      document_id: form.documentId,
    },
  };
}

export function buildCreateCarMaintenanceEventCommand(
  carId: string,
  form: CarMaintenanceFormInput
):
  | { ok: true; command: CreateCarMaintenanceEventCommand }
  | { ok: false; error: string } {
  const fields = validateMaintenanceFields(form);
  if (!fields.ok) {
    return fields;
  }
  return {
    ok: true,
    command: {
      car_id: carId,
      ...fields.value,
    },
  };
}

export function buildUpdateCarMaintenanceEventCommand(
  form: CarMaintenanceFormInput
):
  | { ok: true; command: UpdateCarMaintenanceEventCommand }
  | { ok: false; error: string } {
  const fields = validateMaintenanceFields(form);
  if (!fields.ok) {
    return fields;
  }
  return {
    ok: true,
    command: { ...fields.value },
  };
}

export function parseCarMaintenanceEventDto(
  raw: unknown
): CarMaintenanceEventDto {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid CarMaintenanceEventDto');
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== 'string' || typeof obj.car_id !== 'string') {
    throw new Error('Invalid CarMaintenanceEventDto id fields');
  }
  if (typeof obj.occurred_on !== 'string' || typeof obj.event_type !== 'string') {
    throw new Error('Invalid CarMaintenanceEventDto date or type');
  }
  return {
    id: obj.id,
    car_id: obj.car_id,
    occurred_on: obj.occurred_on,
    event_type: obj.event_type,
    odometer_miles:
      obj.odometer_miles === null || obj.odometer_miles === undefined
        ? null
        : Number(obj.odometer_miles),
    cost_cents:
      obj.cost_cents === null || obj.cost_cents === undefined
        ? null
        : Number(obj.cost_cents),
    title:
      obj.title === null || obj.title === undefined ? null : String(obj.title),
    notes:
      obj.notes === null || obj.notes === undefined ? null : String(obj.notes),
    document_id:
      obj.document_id === null || obj.document_id === undefined
        ? null
        : String(obj.document_id),
    created_at: String(obj.created_at ?? ''),
    updated_at: String(obj.updated_at ?? ''),
  };
}

export function eventTypeLabel(eventType: string): string {
  if (isEventType(eventType)) {
    return EVENT_TYPE_LABELS[eventType];
  }
  return eventType;
}
