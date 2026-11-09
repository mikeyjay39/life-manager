import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FieldLabel } from '@/components/ui/field-label';
import {
  ManagerFeedbackBanner,
  useManagerFeedback,
} from '@/components/ui/manager-feedback';
import { TextInput } from '@/components/ui/text-input';
import { useAuth } from '@/contexts/AuthContext';
import { authenticatedFetch } from '@/lib/api/client';
import type {
  CarDto,
  CreateCarCommand,
  DocumentDto,
  UpdateCarCommand,
} from '@/lib/api/types';
import { useColorPalette } from '@/lib/tenant/TenantThemeContext';

const DISPLAY_NAME_MAX_LEN = 100;
const NOTES_MAX_LEN = 2000;
const MAKE_MODEL_MAX_LEN = 100;
const LICENSE_PLATE_MAX_LEN = 32;
const VIN_LEN = 17;
const YEAR_MIN = 1900;
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

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
  return {
    id: String(d.id ?? ''),
    title: String(d.title ?? ''),
    content: String(d.content ?? ''),
    tags: Array.isArray(d.tags) ? d.tags.map(String) : [],
    created_at: String(d.created_at ?? ''),
    issued_date: d.issued_date != null ? String(d.issued_date) : null,
    expire_date: d.expire_date != null ? String(d.expire_date) : null,
    storage: null,
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

export function yearMax(): number {
  return new Date().getFullYear() + 1;
}

type OptionalTextResult =
  | { ok: true; value: string | null }
  | { ok: false; message: string };

function normalizeOptionalText(
  value: string,
  maxLen: number,
  fieldLabel: string
): OptionalTextResult {
  const trimmed = value.trim();
  if (trimmed === '') {
    return { ok: true, value: null };
  }
  if (unicodeScalarLength(trimmed) > maxLen) {
    return {
      ok: false,
      message: `${fieldLabel} must be at most ${maxLen} characters.`,
    };
  }
  return { ok: true, value: trimmed };
}

function normalizeVin(value: string): OptionalTextResult {
  const trimmed = value.trim().toUpperCase();
  if (trimmed === '') {
    return { ok: true, value: null };
  }
  if (!VIN_PATTERN.test(trimmed)) {
    return {
      ok: false,
      message: `VIN must be ${VIN_LEN} characters (A–H, J–N, P–R, Z, 0–9).`,
    };
  }
  return { ok: true, value: trimmed };
}

/** Uppercase before length check (matches API: ß → SS can expand). */
function normalizeLicensePlate(value: string): OptionalTextResult {
  const trimmed = value.trim();
  if (trimmed === '') {
    return { ok: true, value: null };
  }
  const upper = trimmed.toUpperCase();
  if (unicodeScalarLength(upper) > LICENSE_PLATE_MAX_LEN) {
    return {
      ok: false,
      message: `License plate must be at most ${LICENSE_PLATE_MAX_LEN} characters.`,
    };
  }
  return { ok: true, value: upper };
}

type YearResult =
  | { ok: true; value: number }
  | { ok: false; message: string };

function parseYear(value: string): YearResult {
  const trimmed = value.trim();
  if (!/^\d{4}$/.test(trimmed)) {
    return { ok: false, message: 'Year must be a 4-digit number.' };
  }
  const year = Number(trimmed);
  const max = yearMax();
  if (year < YEAR_MIN || year > max) {
    return {
      ok: false,
      message: `Year must be between ${YEAR_MIN} and ${max}.`,
    };
  }
  return { ok: true, value: year };
}

type CarFormFields = {
  displayName: string;
  make: string;
  model: string;
  year: string;
  vin: string;
  licensePlate: string;
  notes: string;
  insuranceDocumentId: string | null;
  registrationDocumentId: string | null;
};

function emptyCarForm(): CarFormFields {
  return {
    displayName: '',
    make: '',
    model: '',
    year: '',
    vin: '',
    licensePlate: '',
    notes: '',
    insuranceDocumentId: null,
    registrationDocumentId: null,
  };
}

function formFromCar(car: CarDto): CarFormFields {
  return {
    displayName: car.display_name ?? '',
    make: car.make,
    model: car.model,
    year: String(car.year),
    vin: car.vin ?? '',
    licensePlate: car.license_plate ?? '',
    notes: car.notes ?? '',
    insuranceDocumentId: car.insurance_document_id,
    registrationDocumentId: car.registration_document_id,
  };
}

type ValidatedCarFields = {
  display_name: string | null;
  make: string;
  model: string;
  year: number;
  vin: string | null;
  license_plate: string | null;
  notes: string | null;
  insurance_document_id: string | null;
  registration_document_id: string | null;
};

function validateCarForm(fields: CarFormFields):
  | { ok: true; value: ValidatedCarFields }
  | { ok: false; message: string } {
  const make = fields.make.trim();
  if (!make) {
    return { ok: false, message: 'Make is required.' };
  }
  if (unicodeScalarLength(make) > MAKE_MODEL_MAX_LEN) {
    return {
      ok: false,
      message: `Make must be at most ${MAKE_MODEL_MAX_LEN} characters.`,
    };
  }
  const model = fields.model.trim();
  if (!model) {
    return { ok: false, message: 'Model is required.' };
  }
  if (unicodeScalarLength(model) > MAKE_MODEL_MAX_LEN) {
    return {
      ok: false,
      message: `Model must be at most ${MAKE_MODEL_MAX_LEN} characters.`,
    };
  }
  const year = parseYear(fields.year);
  if (!year.ok) {
    return year;
  }
  const displayName = normalizeOptionalText(
    fields.displayName,
    DISPLAY_NAME_MAX_LEN,
    'Display name'
  );
  if (!displayName.ok) {
    return displayName;
  }
  const vin = normalizeVin(fields.vin);
  if (!vin.ok) {
    return vin;
  }
  const licensePlate = normalizeLicensePlate(fields.licensePlate);
  if (!licensePlate.ok) {
    return licensePlate;
  }
  const notes = normalizeOptionalText(fields.notes, NOTES_MAX_LEN, 'Notes');
  if (!notes.ok) {
    return notes;
  }
  return {
    ok: true,
    value: {
      display_name: displayName.value,
      make,
      model,
      year: year.value,
      vin: vin.value,
      license_plate: licensePlate.value,
      notes: notes.value,
      insurance_document_id: fields.insuranceDocumentId,
      registration_document_id: fields.registrationDocumentId,
    },
  };
}

type CarPanelProps = {
  onSelectedCarChange?: (car: CarDto | null) => void;
};

type DocumentLinkPickerProps = {
  label: string;
  accessibilityPrefix: string;
  selectedId: string | null;
  documents: DocumentDto[];
  documentsLoading: boolean;
  documentsError: string | null;
  onChange: (id: string | null) => void;
  chipStyle: object;
  chipSelectedStyle: object;
  chipTextStyle: object;
  chipTextSelectedStyle: object;
  hintStyle: object;
  errorTextStyle: object;
  pickerStyle: object;
};

function DocumentLinkPicker({
  label,
  accessibilityPrefix,
  selectedId,
  documents,
  documentsLoading,
  documentsError,
  onChange,
  chipStyle,
  chipSelectedStyle,
  chipTextStyle,
  chipTextSelectedStyle,
  hintStyle,
  errorTextStyle,
  pickerStyle,
}: DocumentLinkPickerProps) {
  return (
    <View>
      <FieldLabel label={label} />
      {documentsLoading ? (
        <ActivityIndicator accessibilityLabel={`Loading documents for ${label}`} />
      ) : documentsError ? (
        <Text
          style={errorTextStyle}
          accessibilityRole="alert"
          accessibilityLabel={`${label} documents error`}>
          {documentsError}
        </Text>
      ) : documents.length === 0 ? (
        <Text style={hintStyle} accessibilityLabel={`${label} empty documents`}>
          No documents yet. Link stays empty.
        </Text>
      ) : (
        <View style={pickerStyle} accessibilityLabel={`${label} document picker`}>
          <Pressable
            onPress={() => onChange(null)}
            accessibilityRole="button"
            accessibilityState={{ selected: selectedId == null }}
            accessibilityLabel={`Clear ${accessibilityPrefix} document`}
            style={[chipStyle, selectedId == null && chipSelectedStyle]}>
            <Text
              style={[
                chipTextStyle,
                selectedId == null && chipTextSelectedStyle,
              ]}>
              None
            </Text>
          </Pressable>
          {documents.map((doc) => {
            const isSelected = doc.id === selectedId;
            return (
              <Pressable
                key={doc.id}
                onPress={() => onChange(doc.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`Select ${accessibilityPrefix} document ${doc.title}`}
                style={[chipStyle, isSelected && chipSelectedStyle]}>
                <Text
                  style={[
                    chipTextStyle,
                    isSelected && chipTextSelectedStyle,
                  ]}>
                  {doc.title}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

/**
 * Manage Cars on the Car Manager screen.
 *
 * ```
 * User -> Panel : open create / edit / deactivate / reactivate / delete
 * Panel -> API : GET /cars(?include_inactive=true)
 * Panel -> API : GET /documents
 * alt create
 *   Panel -> API : POST /cars
 * else update
 *   Panel -> API : PUT /cars/{id}
 * else deactivate
 *   Panel -> ConfirmDialog : show
 *   User -> ConfirmDialog : confirm | cancel
 *   opt confirm
 *     Panel -> API : POST /cars/{id}/deactivate
 *     Panel -> Panel : clear selection if deactivated was selected
 * end
 * else reactivate
 *   Panel -> API : PUT /cars/{id} (active=true)
 * else delete
 *   Panel -> ConfirmDialog : show
 *   User -> ConfirmDialog : confirm | cancel
 *   opt confirm
 *     Panel -> API : DELETE /cars/{id}
 * end
 * Panel -> Panel : refresh picker
 * ```
 */
export default function CarPanel({ onSelectedCarChange }: CarPanelProps) {
  const { token, handleUnauthorized } = useAuth();
  const palette = useColorPalette();
  const { feedback, showSuccess, showError, dismiss, clearError } =
    useManagerFeedback();

  const [cars, setCars] = useState<CarDto[]>([]);
  const [documents, setDocuments] = useState<DocumentDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const loadGenerationRef = useRef(0);
  const docsLoadGenerationRef = useRef(0);
  selectedIdRef.current = selectedId;

  const [createVisible, setCreateVisible] = useState(false);
  const [createForm, setCreateForm] = useState<CarFormFields>(emptyCarForm);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<CarFormFields>(emptyCarForm);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deactivateTarget, setDeactivateTarget] = useState<CarDto | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CarDto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          gap: 12,
        },
        headerRow: {
          gap: 4,
        },
        selectedName: {
          fontSize: 18,
          fontWeight: '600',
          color: palette.text,
        },
        hint: {
          fontSize: 14,
          color: palette.icon,
        },
        errorText: {
          fontSize: 14,
          color: '#c62828',
        },
        toolbar: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 12,
        },
        includeRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        },
        includeLabel: {
          fontSize: 14,
          color: palette.text,
        },
        picker: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
        },
        pickerChip: {
          borderWidth: 1,
          borderColor: palette.icon,
          borderRadius: 8,
          paddingVertical: 8,
          paddingHorizontal: 12,
          backgroundColor: palette.background,
        },
        pickerChipSelected: {
          borderColor: palette.tint,
          backgroundColor: palette.tint,
        },
        pickerChipInactive: {
          opacity: 0.7,
          borderStyle: 'dashed',
        },
        pickerChipText: {
          color: palette.text,
          fontSize: 15,
        },
        pickerChipTextSelected: {
          color: palette.onTint,
          fontWeight: '600',
        },
        detailCard: {
          gap: 8,
          paddingTop: 4,
        },
        detailRow: {
          gap: 2,
        },
        detailLabel: {
          fontSize: 13,
          color: palette.icon,
        },
        detailValue: {
          fontSize: 15,
          color: palette.text,
        },
        actionRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
          marginTop: 4,
        },
        actionButton: {
          paddingVertical: 10,
          paddingHorizontal: 14,
        },
        label: {
          fontSize: 16,
          marginBottom: 4,
          color: palette.text,
        },
        input: {
          borderWidth: 1,
          borderColor: palette.icon,
          borderRadius: 8,
          padding: 10,
          marginBottom: 8,
          color: palette.text,
          backgroundColor: palette.background,
        },
        inputMultiline: {
          minHeight: 80,
        },
        modalBackdrop: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.45)',
          justifyContent: 'center',
          padding: 24,
        },
        modalCard: {
          backgroundColor: palette.background,
          borderRadius: 12,
          maxHeight: '85%',
          overflow: 'hidden',
        },
        modalScroll: {
          padding: 16,
        },
        modalTitle: {
          fontSize: 20,
          fontWeight: '700',
          marginBottom: 12,
          color: palette.text,
        },
        modalActions: {
          flexDirection: 'row',
          gap: 12,
          padding: 14,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: palette.icon,
        },
        modalActionButton: {
          flex: 1,
          paddingVertical: 12,
        },
        errorBanner: {
          paddingHorizontal: 14,
          paddingTop: 10,
          paddingBottom: 4,
          gap: 6,
        },
        formGap: {
          gap: 4,
          marginBottom: 8,
        },
      }),
    [palette]
  );

  const selected = useMemo(
    () => cars.find((c) => c.id === selectedId) ?? null,
    [cars, selectedId]
  );

  const activeCars = useMemo(() => cars.filter((c) => c.active), [cars]);

  const documentTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const doc of documents) {
      map.set(doc.id, doc.title);
    }
    return map;
  }, [documents]);

  const notifySelection = useCallback(
    (car: CarDto | null) => {
      onSelectedCarChange?.(car);
    },
    [onSelectedCarChange]
  );

  const selectCar = useCallback(
    (car: CarDto | null) => {
      setSelectedId(car?.id ?? null);
      setEditing(false);
      setEditError(null);
      notifySelection(car);
    },
    [notifySelection]
  );

  const syncSelectionToList = useCallback(
    (list: CarDto[]) => {
      const prev = selectedIdRef.current;
      if (!prev) {
        return;
      }
      const stillPresent = list.find((c) => c.id === prev);
      if (!stillPresent || (!includeInactive && !stillPresent.active)) {
        setSelectedId(null);
        notifySelection(null);
        return;
      }
      notifySelection(stillPresent);
    },
    [includeInactive, notifySelection]
  );

  const upsertCarLocally = useCallback((car: CarDto) => {
    setCars((prev) => {
      const without = prev.filter((c) => c.id !== car.id);
      return [...without, car];
    });
  }, []);

  const loadDocuments = useCallback(async () => {
    const generation = ++docsLoadGenerationRef.current;
    if (!token) {
      if (generation !== docsLoadGenerationRef.current) {
        return;
      }
      setDocuments([]);
      setDocumentsError(null);
      return;
    }
    setDocumentsLoading(true);
    setDocumentsError(null);
    try {
      const response = await authenticatedFetch('/documents', {
        method: 'GET',
        token,
        onUnauthorized: handleUnauthorized,
      });
      if (!response.ok) {
        const bodyText = await response.text();
        throw new Error(
          bodyText
            ? `Request failed (${response.status}): ${bodyText}`
            : `Request failed with status ${response.status}`
        );
      }
      const raw = (await response.json()) as unknown;
      const list = Array.isArray(raw) ? raw.map(parseOwnedDocumentDto) : [];
      if (generation !== docsLoadGenerationRef.current) {
        return;
      }
      setDocuments(list);
    } catch (err: unknown) {
      if (generation !== docsLoadGenerationRef.current) {
        return;
      }
      console.error(err);
      const msg =
        err instanceof Error ? err.message : 'Failed to load documents';
      setDocumentsError(msg);
      setDocuments([]);
    } finally {
      if (generation === docsLoadGenerationRef.current) {
        setDocumentsLoading(false);
      }
    }
  }, [token, handleUnauthorized]);

  const load = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
    if (!token) {
      if (generation !== loadGenerationRef.current) {
        return;
      }
      setCars([]);
      clearError();
      return;
    }
    setLoading(true);
    clearError();
    try {
      const path = includeInactive ? '/cars?include_inactive=true' : '/cars';
      const response = await authenticatedFetch(path, {
        method: 'GET',
        token,
        onUnauthorized: handleUnauthorized,
      });
      if (!response.ok) {
        const bodyText = await response.text();
        throw new Error(
          bodyText
            ? `Request failed (${response.status}): ${bodyText}`
            : `Request failed with status ${response.status}`
        );
      }
      const raw = (await response.json()) as unknown;
      const list = Array.isArray(raw) ? raw.map(parseCarDto) : [];
      if (generation !== loadGenerationRef.current) {
        return;
      }
      setCars(list);
      syncSelectionToList(list);
    } catch (err: unknown) {
      if (generation !== loadGenerationRef.current) {
        return;
      }
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Failed to load Cars';
      showError(msg);
    } finally {
      if (generation === loadGenerationRef.current) {
        setLoading(false);
      }
    }
  }, [token, includeInactive, handleUnauthorized, syncSelectionToList, clearError, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const resetCreateForm = () => {
    setCreateForm(emptyCarForm());
    setCreateError(null);
  };

  const closeCreateModal = () => {
    setCreateVisible(false);
    resetCreateForm();
  };

  const openCreateModal = () => {
    resetCreateForm();
    setCreateVisible(true);
    void loadDocuments();
  };

  const startEdit = () => {
    if (!selected) {
      return;
    }
    setEditForm(formFromCar(selected));
    setEditError(null);
    setEditing(true);
    void loadDocuments();
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditError(null);
  };

  const handleCreate = async () => {
    if (creating) {
      return;
    }
    setCreateError(null);
    if (!token) {
      setCreateError('No authentication token available.');
      return;
    }
    const validated = validateCarForm(createForm);
    if (!validated.ok) {
      setCreateError(validated.message);
      return;
    }

    const payload: CreateCarCommand = { ...validated.value };

    setCreating(true);
    try {
      const response = await authenticatedFetch('/cars', {
        method: 'POST',
        token,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        onUnauthorized: handleUnauthorized,
      });
      const bodyText = await response.text();
      if (!response.ok) {
        throw new Error(
          bodyText
            ? `Request failed (${response.status}): ${bodyText}`
            : `Request failed with status ${response.status}`
        );
      }
      let created: CarDto | null = null;
      try {
        created = parseCarDto(JSON.parse(bodyText));
      } catch {
        // refresh will pick up the new car
      }
      closeCreateModal();
      if (created?.id) {
        upsertCarLocally(created);
        selectCar(created);
      }
      await load();
      if (created?.id) {
        selectCar(created);
      }
      showSuccess(
        created?.display_name
          ? `Car "${created.display_name}" created.`
          : 'Car created.'
      );
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Failed to create Car';
      setCreateError(msg);
    } finally {
      setCreating(false);
    }
  };

  const handleSaveEdit = async () => {
    if (saving) {
      return;
    }
    setEditError(null);
    if (!token || !selected) {
      setEditError('No authentication token available.');
      return;
    }
    const validated = validateCarForm(editForm);
    if (!validated.ok) {
      setEditError(validated.message);
      return;
    }

    const payload: UpdateCarCommand = {
      ...validated.value,
      active: null,
    };

    setSaving(true);
    try {
      const response = await authenticatedFetch(`/cars/${selected.id}`, {
        method: 'PUT',
        token,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        onUnauthorized: handleUnauthorized,
      });
      const bodyText = await response.text();
      if (!response.ok) {
        throw new Error(
          bodyText
            ? `Request failed (${response.status}): ${bodyText}`
            : `Request failed with status ${response.status}`
        );
      }
      let updated: CarDto | null = null;
      try {
        updated = parseCarDto(JSON.parse(bodyText));
      } catch {
        // refresh will sync
      }
      setEditing(false);
      if (updated?.id) {
        upsertCarLocally(updated);
        selectCar(updated);
      }
      await load();
      if (updated?.id) {
        selectCar(updated);
      }
      showSuccess(
        updated?.display_name
          ? `Car "${updated.display_name}" updated.`
          : 'Car updated.'
      );
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Failed to update Car';
      setEditError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivateConfirm = async () => {
    if (!token || !deactivateTarget || deactivating) {
      return;
    }
    const target = deactivateTarget;
    setDeactivating(true);
    try {
      const response = await authenticatedFetch(`/cars/${target.id}/deactivate`, {
        method: 'POST',
        token,
        onUnauthorized: handleUnauthorized,
      });
      if (!response.ok) {
        const bodyText = await response.text();
        throw new Error(
          bodyText
            ? `Request failed (${response.status}): ${bodyText}`
            : `Request failed with status ${response.status}`
        );
      }
      setDeactivateTarget(null);
      if (selectedId === target.id) {
        selectCar(null);
      }
      setCars((prev) => {
        if (includeInactive) {
          return prev.map((c) =>
            c.id === target.id
              ? {
                  ...c,
                  active: false,
                  deactivated_at: c.deactivated_at ?? new Date().toISOString(),
                }
              : c
          );
        }
        return prev.filter((c) => c.id !== target.id);
      });
      await load();
    } catch (err: unknown) {
      console.error(err);
      const msg =
        err instanceof Error ? err.message : 'Failed to deactivate Car';
      showError(msg);
      setDeactivateTarget(null);
    } finally {
      setDeactivating(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!token || !deleteTarget || deleting) {
      return;
    }
    const target = deleteTarget;
    setDeleting(true);
    try {
      const response = await authenticatedFetch(`/cars/${target.id}`, {
        method: 'DELETE',
        token,
        onUnauthorized: handleUnauthorized,
      });
      if (!response.ok && response.status !== 204) {
        const bodyText = await response.text();
        throw new Error(
          bodyText
            ? `Request failed (${response.status}): ${bodyText}`
            : `Request failed with status ${response.status}`
        );
      }
      setDeleteTarget(null);
      if (selectedId === target.id) {
        selectCar(null);
      }
      setCars((prev) => prev.filter((c) => c.id !== target.id));
      await load();
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Failed to delete Car';
      showError(msg);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const handleReactivate = async (car: CarDto) => {
    if (!token || reactivatingId) {
      return;
    }
    setReactivatingId(car.id);
    clearError();
    try {
      const payload: UpdateCarCommand = {
        make: car.make,
        model: car.model,
        year: car.year,
        active: true,
      };
      const response = await authenticatedFetch(`/cars/${car.id}`, {
        method: 'PUT',
        token,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        onUnauthorized: handleUnauthorized,
      });
      const bodyText = await response.text();
      if (!response.ok) {
        throw new Error(
          bodyText
            ? `Request failed (${response.status}): ${bodyText}`
            : `Request failed with status ${response.status}`
        );
      }
      let reactivated: CarDto | null = null;
      try {
        reactivated = parseCarDto(JSON.parse(bodyText));
      } catch {
        reactivated = { ...car, active: true, deactivated_at: null };
      }
      upsertCarLocally(reactivated);
      await load();
    } catch (err: unknown) {
      console.error(err);
      const msg =
        err instanceof Error ? err.message : 'Failed to reactivate Car';
      showError(msg);
    } finally {
      setReactivatingId(null);
    }
  };

  const renderCarFormFields = (
    form: CarFormFields,
    setForm: React.Dispatch<React.SetStateAction<CarFormFields>>,
    mode: 'create' | 'edit'
  ) => {
    const prefix = mode === 'create' ? 'Create' : 'Edit';
    return (
      <View style={styles.formGap}>
        <FieldLabel label="Make" required style={styles.label} />
        <TextInput
          style={styles.input}
          value={form.make}
          onChangeText={(make) => setForm((prev) => ({ ...prev, make }))}
          placeholder="Make"
          placeholderTextColor={palette.icon}
          aria-required
          accessibilityLabel={`${prefix} make`}
        />
        <FieldLabel label="Model" required style={styles.label} />
        <TextInput
          style={styles.input}
          value={form.model}
          onChangeText={(model) => setForm((prev) => ({ ...prev, model }))}
          placeholder="Model"
          placeholderTextColor={palette.icon}
          aria-required
          accessibilityLabel={`${prefix} model`}
        />
        <FieldLabel label="Year" required style={styles.label} />
        <TextInput
          style={styles.input}
          value={form.year}
          onChangeText={(year) => setForm((prev) => ({ ...prev, year }))}
          placeholder="YYYY"
          placeholderTextColor={palette.icon}
          keyboardType="number-pad"
          aria-required
          accessibilityLabel={`${prefix} year`}
        />
        <FieldLabel label="Display name" style={styles.label} />
        <TextInput
          style={styles.input}
          value={form.displayName}
          onChangeText={(displayName) =>
            setForm((prev) => ({ ...prev, displayName }))
          }
          placeholder="Display name (optional)"
          placeholderTextColor={palette.icon}
          accessibilityLabel={`${prefix} display name`}
        />
        <FieldLabel label="VIN" style={styles.label} />
        <TextInput
          style={styles.input}
          value={form.vin}
          onChangeText={(vin) => setForm((prev) => ({ ...prev, vin }))}
          placeholder="VIN (optional)"
          placeholderTextColor={palette.icon}
          autoCapitalize="characters"
          accessibilityLabel={`${prefix} VIN`}
        />
        <FieldLabel label="License plate" style={styles.label} />
        <TextInput
          style={styles.input}
          value={form.licensePlate}
          onChangeText={(licensePlate) =>
            setForm((prev) => ({ ...prev, licensePlate }))
          }
          placeholder="License plate (optional)"
          placeholderTextColor={palette.icon}
          autoCapitalize="characters"
          accessibilityLabel={`${prefix} license plate`}
        />
        <FieldLabel label="Notes" style={styles.label} />
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={form.notes}
          onChangeText={(notes) => setForm((prev) => ({ ...prev, notes }))}
          placeholder="Notes (optional)"
          placeholderTextColor={palette.icon}
          multiline
          textAlignVertical="top"
          accessibilityLabel={`${prefix} notes`}
        />
        <DocumentLinkPicker
          label="Insurance document"
          accessibilityPrefix="insurance"
          selectedId={form.insuranceDocumentId}
          documents={documents}
          documentsLoading={documentsLoading}
          documentsError={documentsError}
          onChange={(insuranceDocumentId) =>
            setForm((prev) => ({ ...prev, insuranceDocumentId }))
          }
          chipStyle={styles.pickerChip}
          chipSelectedStyle={styles.pickerChipSelected}
          chipTextStyle={styles.pickerChipText}
          chipTextSelectedStyle={styles.pickerChipTextSelected}
          hintStyle={styles.hint}
          errorTextStyle={styles.errorText}
          pickerStyle={styles.picker}
        />
        <DocumentLinkPicker
          label="Registration document"
          accessibilityPrefix="registration"
          selectedId={form.registrationDocumentId}
          documents={documents}
          documentsLoading={documentsLoading}
          documentsError={documentsError}
          onChange={(registrationDocumentId) =>
            setForm((prev) => ({ ...prev, registrationDocumentId }))
          }
          chipStyle={styles.pickerChip}
          chipSelectedStyle={styles.pickerChipSelected}
          chipTextStyle={styles.pickerChipText}
          chipTextSelectedStyle={styles.pickerChipTextSelected}
          hintStyle={styles.hint}
          errorTextStyle={styles.errorText}
          pickerStyle={styles.picker}
        />
      </View>
    );
  };

  if (!token) {
    return (
      <View style={styles.container}>
        <ThemedText style={styles.hint}>Sign in to manage Cars.</ThemedText>
      </View>
    );
  }

  const selectedLabel = selected ? carDisplayLabel(selected) : null;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <ThemedText
          style={styles.selectedName}
          accessibilityLabel={
            selected
              ? `Selected Car ${selectedLabel}`
              : 'No Car selected'
          }>
          {selected ? selectedLabel : 'No car selected'}
        </ThemedText>
        {!selected && activeCars.length === 0 ? (
          <ThemedText style={styles.hint}>
            No cars yet. Add a car to manage maintenance later.
          </ThemedText>
        ) : null}
      </View>

      <View style={styles.toolbar}>
        <Button
          label="Create Car"
          onPress={openCreateModal}
          accessibilityLabel="Create Car"
          style={styles.actionButton}
        />
        <View style={styles.includeRow}>
          <Text style={styles.includeLabel}>Include inactive</Text>
          <Switch
            value={includeInactive}
            onValueChange={setIncludeInactive}
            accessibilityLabel="Include inactive Cars"
          />
        </View>
        <Button
          variant="outline"
          label={loading ? 'Refreshing…' : 'Refresh'}
          onPress={() => void load()}
          disabled={loading}
          accessibilityLabel="Refresh Cars"
          style={styles.actionButton}
        />
      </View>

      {feedback ? (
        <ManagerFeedbackBanner
          tone={feedback.tone}
          message={feedback.message}
          onDismiss={dismiss}
        />
      ) : null}

      {loading && cars.length === 0 ? (
        <ActivityIndicator color={palette.tint} accessibilityLabel="Loading Cars" />
      ) : cars.length === 0 ? (
        <ThemedText style={styles.hint} accessibilityLabel="Cars empty state">
          {includeInactive
            ? 'No Cars yet.'
            : 'No active Cars. Create one, or include inactive to reactivate.'}
        </ThemedText>
      ) : (
        <View style={styles.picker} accessibilityLabel="Car picker">
          {cars.map((car) => {
            const isSelected = car.id === selectedId;
            const label = carDisplayLabel(car);
            return (
              <Pressable
                key={car.id}
                onPress={() => selectCar(car)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={
                  car.active
                    ? `Select Car ${label}`
                    : `Select inactive Car ${label}`
                }
                style={[
                  styles.pickerChip,
                  isSelected && styles.pickerChipSelected,
                  !car.active && styles.pickerChipInactive,
                ]}>
                <Text
                  style={[
                    styles.pickerChipText,
                    isSelected && styles.pickerChipTextSelected,
                  ]}>
                  {car.active ? label : `${label} (inactive)`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {selected ? (
        <View style={styles.detailCard} accessibilityLabel="Car details">
          {editing ? (
            <>
              {renderCarFormFields(editForm, setEditForm, 'edit')}
              {editError ? (
                <ManagerFeedbackBanner
                  tone="error"
                  message={editError}
                  onDismiss={() => setEditError(null)}
                />
              ) : null}
              <View style={styles.actionRow}>
                <Button
                  label={saving ? 'Saving…' : 'Save'}
                  onPress={() => void handleSaveEdit()}
                  disabled={saving}
                  loading={saving}
                  accessibilityLabel="Save Car"
                  style={styles.actionButton}
                />
                <Button
                  variant="outline"
                  label="Cancel"
                  onPress={cancelEdit}
                  disabled={saving}
                  accessibilityLabel="Cancel edit Car"
                  style={styles.actionButton}
                />
              </View>
            </>
          ) : (
            <>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Make / model / year</Text>
                <Text style={styles.detailValue}>
                  {selected.make} {selected.model} ({selected.year})
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>VIN</Text>
                <Text style={styles.detailValue}>{selected.vin || '—'}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>License plate</Text>
                <Text style={styles.detailValue}>
                  {selected.license_plate || '—'}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Notes</Text>
                <Text style={styles.detailValue}>{selected.notes || '—'}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Insurance document</Text>
                <Text
                  style={styles.detailValue}
                  accessibilityLabel={
                    selected.insurance_document_id
                      ? `Linked insurance document ${
                          documentTitleById.get(selected.insurance_document_id) ??
                          selected.insurance_document_id
                        }`
                      : 'No insurance document linked'
                  }>
                  {selected.insurance_document_id
                    ? documentTitleById.get(selected.insurance_document_id) ??
                      selected.insurance_document_id
                    : '—'}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Registration document</Text>
                <Text
                  style={styles.detailValue}
                  accessibilityLabel={
                    selected.registration_document_id
                      ? `Linked registration document ${
                          documentTitleById.get(
                            selected.registration_document_id
                          ) ?? selected.registration_document_id
                        }`
                      : 'No registration document linked'
                  }>
                  {selected.registration_document_id
                    ? documentTitleById.get(selected.registration_document_id) ??
                      selected.registration_document_id
                    : '—'}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Status</Text>
                <Text style={styles.detailValue}>
                  {selected.active ? 'Active' : 'Inactive'}
                </Text>
              </View>
              <View style={styles.actionRow}>
                {selected.active ? (
                  <>
                    <Button
                      variant="secondary"
                      label="Edit"
                      onPress={startEdit}
                      accessibilityLabel="Edit Car"
                      style={styles.actionButton}
                    />
                    <Button
                      variant="destructive"
                      label="Deactivate"
                      onPress={() => setDeactivateTarget(selected)}
                      accessibilityLabel="Deactivate Car"
                      style={styles.actionButton}
                    />
                    <Button
                      variant="destructive"
                      label="Delete"
                      onPress={() => setDeleteTarget(selected)}
                      accessibilityLabel="Delete Car"
                      style={styles.actionButton}
                    />
                  </>
                ) : (
                  <>
                    <Button
                      label={
                        reactivatingId === selected.id
                          ? 'Reactivating…'
                          : 'Reactivate'
                      }
                      onPress={() => void handleReactivate(selected)}
                      disabled={reactivatingId === selected.id}
                      loading={reactivatingId === selected.id}
                      accessibilityLabel="Reactivate Car"
                      style={styles.actionButton}
                    />
                    <Button
                      variant="destructive"
                      label="Delete"
                      onPress={() => setDeleteTarget(selected)}
                      accessibilityLabel="Delete Car"
                      style={styles.actionButton}
                    />
                  </>
                )}
              </View>
            </>
          )}
        </View>
      ) : null}

      <Modal
        visible={createVisible}
        animationType="fade"
        transparent
        onRequestClose={closeCreateModal}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView
              style={styles.modalScroll}
              keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>Create Car</Text>
              {renderCarFormFields(createForm, setCreateForm, 'create')}
            </ScrollView>
            {createError ? (
              <View style={styles.errorBanner}>
                <ManagerFeedbackBanner
                  tone="error"
                  message={createError}
                  onDismiss={() => setCreateError(null)}
                />
              </View>
            ) : null}
            <View style={styles.modalActions}>
              <Button
                label={creating ? 'Creating…' : 'Create'}
                onPress={() => void handleCreate()}
                disabled={creating}
                loading={creating}
                accessibilityLabel="Submit create Car"
                style={styles.modalActionButton}
              />
              <Button
                variant="outline"
                label="Cancel"
                onPress={closeCreateModal}
                disabled={creating}
                accessibilityLabel="Cancel create Car"
                style={styles.modalActionButton}
              />
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        visible={deactivateTarget != null}
        title="Deactivate Car?"
        message={
          deactivateTarget
            ? `Deactivate "${carDisplayLabel(deactivateTarget)}"? It leaves the active picker. You can reactivate later.`
            : ''
        }
        confirmLabel="Deactivate"
        cancelLabel="Cancel"
        destructive
        onCancel={() => {
          if (!deactivating) {
            setDeactivateTarget(null);
          }
        }}
        onConfirm={() => void handleDeactivateConfirm()}
      />

      <ConfirmDialog
        visible={deleteTarget != null}
        title="Delete Car?"
        message={
          deleteTarget
            ? `Delete "${carDisplayLabel(deleteTarget)}"? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onCancel={() => {
          if (!deleting) {
            setDeleteTarget(null);
          }
        }}
        onConfirm={() => void handleDeleteConfirm()}
      />
    </View>
  );
}
