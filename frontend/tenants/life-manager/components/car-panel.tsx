import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { ManagerListSkeleton } from '@/components/ui/manager-list-skeleton';
import { ManagerSection } from '@/components/ui/manager-section';
import { ManagerSelectionContext } from '@/components/ui/manager-selection-context';
import {
  createManagerPickerChipStyles,
  createManagerSelectionSurfaceStyles,
} from '@/components/ui/manager-selection';
import { TextInput } from '@/components/ui/text-input';
import { useAuth } from '@/contexts/AuthContext';
import { useWebEscapeClose } from '@/hooks/use-web-escape-close';
import { authenticatedFetch } from '@/lib/api/client';
import type {
  CarDto,
  CreateCarCommand,
  DocumentDto,
  UpdateCarCommand,
} from '@/lib/api/types';
import { useColorPalette } from '@/lib/tenant/TenantThemeContext';
import DocumentCreateForm from '@/tenants/life-manager/components/document-create-form';
import DocumentPickerModal from './document-picker-modal';
import {
  type CreatedDocument,
  mergeCreatedDocuments,
  pruneCreatedDocuments,
} from './document-list-merge';

import {
  carDisplayLabel,
  carDocumentPrefillTags,
  carDocumentPrefillTitle,
  carFormDraftLabel,
  parseCarDto,
  parseOwnedDocumentDto,
  unicodeScalarLength,
  yearMax,
  type CarDocumentLinkRole,
} from './car-panel-utils';

export {
  carDisplayLabel,
  carDocumentPrefillTags,
  carDocumentPrefillTitle,
  carFormDraftLabel,
  parseCarDto,
  parseOwnedDocumentDto,
  unicodeScalarLength,
  yearMax,
  type CarDocumentLinkRole,
} from './car-panel-utils';

const DISPLAY_NAME_MAX_LEN = 100;
const NOTES_MAX_LEN = 2000;
const MAKE_MODEL_MAX_LEN = 100;
const LICENSE_PLATE_MAX_LEN = 32;
const VIN_LEN = 17;
const YEAR_MIN = 1900;
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

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
  onChoose: () => void;
  onChange: (id: string | null) => void;
  onCreatePress?: () => void;
  /** True while the parent Car form submits, so no link action can start. */
  disabled?: boolean;
  createAccessibilityLabel?: string;
  actionRowStyle: object;
  actionButtonStyle: object;
};

function DocumentLinkPicker({
  label,
  accessibilityPrefix,
  selectedId,
  documents,
  onChoose,
  onChange,
  onCreatePress,
  disabled = false,
  createAccessibilityLabel,
  actionRowStyle,
  actionButtonStyle,
}: DocumentLinkPickerProps) {
  return (
    <View>
      <FieldLabel label={label} />
      {selectedId ? (
        <ThemedText accessibilityLabel={`Selected ${accessibilityPrefix} document`}>
          {documents.find((document) => document.id === selectedId)?.title ?? selectedId}
        </ThemedText>
      ) : null}
      <View style={actionRowStyle}>
        <Button
          label={selectedId ? 'Change' : 'Choose document'}
          variant="outline"
          accessibilityLabel={`${selectedId ? 'Change' : 'Choose'} ${accessibilityPrefix} document`}
          onPress={onChoose}
          disabled={disabled}
          style={actionButtonStyle}
        />
        {selectedId ? (
          <Button label="Remove" variant="outline" accessibilityLabel={`Remove ${accessibilityPrefix} document`} onPress={() => onChange(null)} disabled={disabled} style={actionButtonStyle} />
        ) : null}
      </View>
      {onCreatePress ? (
        <View style={actionRowStyle}>
          <Button
            variant="outline"
            label="Create document"
            onPress={onCreatePress}
            disabled={disabled}
            accessibilityLabel={
              createAccessibilityLabel ?? `Create ${accessibilityPrefix} document`
            }
            style={actionButtonStyle}
          />
        </View>
      ) : null}
    </View>
  );
}

type DocumentCreateApplyTarget =
  | { kind: 'persist'; carId: string }
  | { kind: 'form'; mode: 'create' | 'edit' };

type DocumentCreateSession = {
  role: CarDocumentLinkRole;
  apply: DocumentCreateApplyTarget;
  carLabel: string;
  formKey: number;
};

type ReplaceDocumentConfirm = {
  role: CarDocumentLinkRole;
  apply: DocumentCreateApplyTarget;
  carLabel: string;
  existingTitle: string;
};

type PendingDocumentLink = {
  role: CarDocumentLinkRole;
  carId: string;
  document: DocumentDto;
};

/**
 * Manage Cars on the Car Manager screen.
 *
 * ```
 * User -> Panel : open create / edit / deactivate / reactivate / delete
 * Panel -> API : GET /cars(?include_inactive=true)
 * Panel -> API : GET /documents
 * alt create Car
 *   Panel -> API : POST /cars
 * else update Car
 *   Panel -> API : PUT /cars/{id}
 * else create insurance/registration Document (not while the form saves)
 *   opt existing link
 *     Panel -> ConfirmDialog : replace?
 *     User -> ConfirmDialog : confirm | cancel
 *   Panel -> DocumentCreateForm : modal (prefill title+tags)
 *   DocumentCreateForm -> API : POST /documents
 *   alt apply persist (saved Car detail)
 *     Panel -> API : PUT /cars/{id} (document id)
 *     Panel -> Panel : refresh Cars + Documents
 *     opt PUT failed; user retries on active Car
 *       opt role has a linked Document
 *         Panel -> ConfirmDialog : confirm replacement before retry
 *       Panel -> API : PUT /cars/{id} (kept Document id)
 *   else apply form (create/edit) still open
 *     Panel -> Panel : set form field only; Save owns persist
 *   else form closed
 *     Panel -> Panel : keep Document in library; show error
 *   end
 *   Panel -> Panel : merge DTOs created after a GET /documents started
 * else choose existing Document in form
 *   Panel -> DocumentPickerModal : authorized list, current id
 *   User -> DocumentPickerModal : search, stage choice
 *   alt Select document
 *     DocumentPickerModal -> Panel : set form field only
 *   else dismiss
 *     DocumentPickerModal -> Panel : keep old id and form values
 * end
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
  const createdDocumentsRef = useRef<CreatedDocument[]>([]);
  const documentSequenceRef = useRef(0);
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

  const [documentCreateSession, setDocumentCreateSession] =
    useState<DocumentCreateSession | null>(null);
  const [documentPickerTarget, setDocumentPickerTarget] = useState<{
    mode: 'create' | 'edit'; role: CarDocumentLinkRole;
  } | null>(null);
  const [replaceDocumentConfirm, setReplaceDocumentConfirm] =
    useState<ReplaceDocumentConfirm | null>(null);
  const [documentCreateSubmitting, setDocumentCreateSubmitting] =
    useState(false);
  const [pendingDocumentLink, setPendingDocumentLink] =
    useState<PendingDocumentLink | null>(null);
  const [retryLinkConfirm, setRetryLinkConfirm] = useState<
    (PendingDocumentLink & { existingTitle: string }) | null
  >(null);
  const [linkingDocument, setLinkingDocument] = useState(false);
  const documentCreateFormKeyRef = useRef(0);

  const pickerChipStyles = useMemo(
    () => createManagerPickerChipStyles(palette),
    [palette]
  );
  const selectionSurfaceStyles = useMemo(
    () => createManagerSelectionSurfaceStyles(palette),
    [palette]
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          gap: 12,
        },
        headerRow: {
          gap: 4,
        },
        hint: {
          fontSize: 14,
          color: palette.icon,
        },
        errorText: {
          fontSize: 14,
          color: palette.danger,
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
        pickerChip: pickerChipStyles.chip,
        pickerChipSelected: pickerChipStyles.chipSelected,
        pickerChipInactive: pickerChipStyles.chipInactive,
        pickerChipText: pickerChipStyles.chipText,
        pickerChipTextSelected: pickerChipStyles.chipTextSelected,
        detailCard: {
          ...selectionSurfaceStyles.selectedSurface,
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
    [palette, pickerChipStyles, selectionSurfaceStyles]
  );

  const selected = useMemo(
    () => cars.find((c) => c.id === selectedId) ?? null,
    [cars, selectedId]
  );

  useEffect(() => {
    setDocumentPickerTarget(null);
  }, [selectedId, selected?.active, editing, createVisible]);

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

  const upsertDocumentLocally = useCallback((document: DocumentDto) => {
    // A GET that started before creation can omit this Document, so the
    // list responses of such GETs merge it back in.
    if (!createdDocumentsRef.current.some((entry) => entry.document.id === document.id)) {
      documentSequenceRef.current += 1;
      createdDocumentsRef.current = [
        ...createdDocumentsRef.current,
        { document, createdSequence: documentSequenceRef.current },
      ];
    }
    setDocuments((prev) => {
      if (prev.some((d) => d.id === document.id)) {
        return prev;
      }
      return [...prev, document];
    });
  }, []);

  const loadDocuments = useCallback(async () => {
    const generation = ++docsLoadGenerationRef.current;
    const getStartedSequence = documentSequenceRef.current;
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
      setDocuments(
        mergeCreatedDocuments(list, createdDocumentsRef.current, getStartedSequence)
      );
      createdDocumentsRef.current = pruneCreatedDocuments(
        createdDocumentsRef.current,
        getStartedSequence
      );
    } catch (err: unknown) {
      if (generation !== docsLoadGenerationRef.current) {
        return;
      }
      console.error(err);
      const msg =
        err instanceof Error ? err.message : 'Failed to load documents';
      setDocumentsError(msg);
      // A failed GET covers no created Document, so keep all of them.
      setDocuments(createdDocumentsRef.current.map((entry) => entry.document));
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
    // Created DTOs belong to the signed-in user only.
    createdDocumentsRef.current = [];
  }, [token]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const resetCreateForm = () => {
    setCreateForm(emptyCarForm());
    setCreateError(null);
  };

  const closeCreateModal = useCallback(() => {
    if (
      documentCreateSession != null ||
      documentPickerTarget != null ||
      replaceDocumentConfirm != null ||
      documentCreateSubmitting
    ) {
      return;
    }
    setCreateVisible(false);
    resetCreateForm();
  }, [
    documentCreateSession,
    documentPickerTarget,
    replaceDocumentConfirm,
    documentCreateSubmitting,
  ]);

  useWebEscapeClose(
    createVisible &&
      documentCreateSession == null &&
      documentPickerTarget == null &&
      replaceDocumentConfirm == null,
    closeCreateModal
  );

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

  const closeDocumentCreateModal = useCallback(() => {
    if (documentCreateSubmitting) {
      return;
    }
    setDocumentCreateSession(null);
  }, [documentCreateSubmitting]);

  useWebEscapeClose(documentCreateSession != null, closeDocumentCreateModal);

  const isFormSubmitting = useCallback(
    (apply: DocumentCreateApplyTarget): boolean => {
      if (apply.kind !== 'form') {
        return false;
      }
      return apply.mode === 'create' ? creating : saving;
    },
    [creating, saving]
  );

  const isFormOpen = useCallback(
    (apply: DocumentCreateApplyTarget): boolean => {
      if (apply.kind !== 'form') {
        return true;
      }
      return apply.mode === 'create' ? createVisible : editing;
    },
    [createVisible, editing]
  );

  const openDocumentCreateSession = useCallback(
    (role: CarDocumentLinkRole, apply: DocumentCreateApplyTarget, carLabel: string) => {
      // The Car request closes the form when it completes, so a Document
      // created after that point would link to a closed form.
      if (isFormSubmitting(apply)) {
        return;
      }
      documentCreateFormKeyRef.current += 1;
      setDocumentCreateSession({
        role,
        apply,
        carLabel,
        formKey: documentCreateFormKeyRef.current,
      });
    },
    [isFormSubmitting]
  );

  const existingLinkIdForTarget = useCallback(
    (
      role: CarDocumentLinkRole,
      apply: DocumentCreateApplyTarget
    ): string | null => {
      if (apply.kind === 'persist') {
        const car = cars.find((c) => c.id === apply.carId);
        if (!car) {
          return null;
        }
        return role === 'insurance'
          ? car.insurance_document_id
          : car.registration_document_id;
      }
      const form = apply.mode === 'create' ? createForm : editForm;
      return role === 'insurance'
        ? form.insuranceDocumentId
        : form.registrationDocumentId;
    },
    [cars, createForm, editForm]
  );

  const openDocumentPicker = (mode: 'create' | 'edit', role: CarDocumentLinkRole) => {
    if (isFormSubmitting({ kind: 'form', mode })) {
      return;
    }
    setDocumentPickerTarget({ mode, role });
    void loadDocuments();
  };

  const requestCreateDocument = useCallback(
    (role: CarDocumentLinkRole, apply: DocumentCreateApplyTarget, carLabel: string) => {
      if (isFormSubmitting(apply)) {
        return;
      }
      const existingId = existingLinkIdForTarget(role, apply);
      if (existingId) {
        setReplaceDocumentConfirm({
          role,
          apply,
          carLabel,
          existingTitle: documentTitleById.get(existingId) ?? existingId,
        });
        return;
      }
      openDocumentCreateSession(role, apply, carLabel);
    },
    [
      documentTitleById,
      existingLinkIdForTarget,
      isFormSubmitting,
      openDocumentCreateSession,
    ]
  );

  const persistDocumentLink = useCallback(
    async (carId: string, role: CarDocumentLinkRole, document: DocumentDto) => {
      if (!token) {
        upsertDocumentLocally(document);
        showError('No authentication token available.');
        setPendingDocumentLink({ role, carId, document });
        return;
      }
      const car = cars.find((c) => c.id === carId);
      if (!car) {
        upsertDocumentLocally(document);
        showError('Car not found. Refresh and try again.');
        setPendingDocumentLink({ role, carId, document });
        return;
      }
      if (!car.active) {
        upsertDocumentLocally(document);
        showError('The Document was kept. Reactivate the Car before linking it.');
        setPendingDocumentLink({ role, carId, document });
        return;
      }
      setLinkingDocument(true);
      clearError();
      try {
        const payload: UpdateCarCommand = {
          make: car.make,
          model: car.model,
          year: car.year,
          active: null,
          ...(role === 'insurance'
            ? { insurance_document_id: document.id }
            : { registration_document_id: document.id }),
        };
        const response = await authenticatedFetch(`/cars/${carId}`, {
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
        setPendingDocumentLink(null);
        upsertDocumentLocally(document);
        if (updated?.id) {
          upsertCarLocally(updated);
          selectCar(updated);
        }
        await Promise.all([load(), loadDocuments()]);
        // The user can select another Car during the refresh; keep that choice.
        if (updated?.id && selectedIdRef.current === carId) {
          selectCar(updated);
        }
        showSuccess(
          role === 'insurance'
            ? `Insurance document "${document.title}" linked.`
            : `Registration document "${document.title}" linked.`
        );
      } catch (err: unknown) {
        console.error(err);
        const msg =
          err instanceof Error
            ? err.message
            : 'Document was created, but linking to the Car failed.';
        upsertDocumentLocally(document);
        setPendingDocumentLink({ role, carId, document });
        showError(
          `${msg} The Document was kept. Use Retry link to attach it.`
        );
      } finally {
        setLinkingDocument(false);
      }
    },
    [
      token,
      cars,
      handleUnauthorized,
      clearError,
      showError,
      showSuccess,
      upsertCarLocally,
      upsertDocumentLocally,
      selectCar,
      load,
      loadDocuments,
    ]
  );

  const applyCreatedDocumentToForm = useCallback(
    (mode: 'create' | 'edit', role: CarDocumentLinkRole, document: DocumentDto) => {
      upsertDocumentLocally(document);
      const setForm = mode === 'create' ? setCreateForm : setEditForm;
      setForm((prev) =>
        role === 'insurance'
          ? { ...prev, insuranceDocumentId: document.id }
          : { ...prev, registrationDocumentId: document.id }
      );
      showSuccess(
        role === 'insurance'
          ? `Insurance document "${document.title}" selected. Save the Car to keep the link.`
          : `Registration document "${document.title}" selected. Save the Car to keep the link.`
      );
    },
    [showSuccess, upsertDocumentLocally]
  );

  const handleDocumentCreated = useCallback(
    (document: DocumentDto) => {
      const session = documentCreateSession;
      if (!session) {
        return;
      }
      setDocumentCreateSession(null);
      if (session.apply.kind === 'persist') {
        void persistDocumentLink(session.apply.carId, session.role, document);
        return;
      }
      if (!isFormOpen(session.apply)) {
        upsertDocumentLocally(document);
        showError(
          `Document "${document.title}" was kept, but the Car form closed. Choose it from the Car form to link it.`
        );
        return;
      }
      applyCreatedDocumentToForm(session.apply.mode, session.role, document);
    },
    [
      documentCreateSession,
      isFormOpen,
      persistDocumentLink,
      applyCreatedDocumentToForm,
      upsertDocumentLocally,
      showError,
    ]
  );

  const handleRetryPendingLink = useCallback(() => {
    if (!pendingDocumentLink || linkingDocument) {
      return;
    }
    const car = cars.find((c) => c.id === pendingDocumentLink.carId);
    if (!car?.active) {
      return;
    }
    const existingId =
      pendingDocumentLink.role === 'insurance'
        ? car.insurance_document_id
        : car.registration_document_id;
    if (existingId && existingId !== pendingDocumentLink.document.id) {
      setRetryLinkConfirm({
        ...pendingDocumentLink,
        existingTitle: documentTitleById.get(existingId) ?? existingId,
      });
      return;
    }
    void persistDocumentLink(
      pendingDocumentLink.carId,
      pendingDocumentLink.role,
      pendingDocumentLink.document
    );
  }, [
    pendingDocumentLink,
    linkingDocument,
    cars,
    documentTitleById,
    persistDocumentLink,
  ]);

  const handleCreate = async () => {
    if (creating || documentPickerTarget != null) {
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
    if (saving || documentPickerTarget != null) {
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
    const draftLabel = carFormDraftLabel(form);
    const submitting = isFormSubmitting({ kind: 'form', mode });
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
          onChoose={() => openDocumentPicker(mode, 'insurance')}
          onChange={(insuranceDocumentId) =>
            setForm((prev) => ({ ...prev, insuranceDocumentId }))
          }
          onCreatePress={() =>
            requestCreateDocument(
              'insurance',
              { kind: 'form', mode },
              draftLabel
            )
          }
          createAccessibilityLabel={`${prefix} create insurance document`}
          disabled={submitting}
          actionRowStyle={styles.actionRow}
          actionButtonStyle={styles.actionButton}
        />
        <DocumentLinkPicker
          label="Registration document"
          accessibilityPrefix="registration"
          selectedId={form.registrationDocumentId}
          documents={documents}
          onChoose={() => openDocumentPicker(mode, 'registration')}
          onChange={(registrationDocumentId) =>
            setForm((prev) => ({ ...prev, registrationDocumentId }))
          }
          onCreatePress={() =>
            requestCreateDocument(
              'registration',
              { kind: 'form', mode },
              draftLabel
            )
          }
          createAccessibilityLabel={`${prefix} create registration document`}
          disabled={submitting}
          actionRowStyle={styles.actionRow}
          actionButtonStyle={styles.actionButton}
        />
      </View>
    );
  };

  if (!token) {
    return (
      <ManagerSection title="Cars" accessibilityLabel="Cars section">
        <ThemedText style={styles.hint}>Sign in to manage Cars.</ThemedText>
      </ManagerSection>
    );
  }

  const selectedLabel = selected ? carDisplayLabel(selected) : null;

  return (
    <ManagerSection
      title="Cars"
      accessibilityLabel="Cars section"
      primaryAction={{
        label: 'Create Car',
        onPress: openCreateModal,
        accessibilityLabel: 'Create Car',
      }}
      secondaryActions={[
        {
          label: loading ? 'Refreshing…' : 'Refresh',
          onPress: () => void load(),
          disabled: loading,
          accessibilityLabel: 'Refresh Cars',
        },
      ]}
      toolbarExtra={
        <View style={styles.includeRow}>
          <Text style={styles.includeLabel}>Include inactive</Text>
          <Switch
            value={includeInactive}
            onValueChange={setIncludeInactive}
            accessibilityLabel="Include inactive Cars"
          />
        </View>
      }
    >
      <View style={styles.container}>
      <View style={styles.headerRow}>
        <ManagerSelectionContext
          entityNoun="Car"
          selectedLabel={selected ? selectedLabel : null}
          inactive={selected ? !selected.active : false}
          emptyHint={
            activeCars.length === 0
              ? 'No cars yet. Add a car to manage maintenance later.'
              : 'Choose a Car below for maintenance and charts.'
          }
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
        <ManagerListSkeleton accessibilityLabel="Loading Cars" />
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
                  disabled={saving || documentPickerTarget != null}
                  loading={saving}
                  accessibilityLabel="Save Car"
                  style={styles.actionButton}
                />
                <Button
                  variant="outline"
                  label="Cancel"
                  onPress={cancelEdit}
                  disabled={saving || documentPickerTarget != null}
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
              {selected.active ? (
                <View style={styles.actionRow}>
                  <Button
                    variant="outline"
                    label="Create insurance document"
                    onPress={() =>
                      requestCreateDocument(
                        'insurance',
                        { kind: 'persist', carId: selected.id },
                        carDisplayLabel(selected)
                      )
                    }
                    disabled={linkingDocument}
                    accessibilityLabel="Create insurance document"
                    style={styles.actionButton}
                  />
                  <Button
                    variant="outline"
                    label="Create registration document"
                    onPress={() =>
                      requestCreateDocument(
                        'registration',
                        { kind: 'persist', carId: selected.id },
                        carDisplayLabel(selected)
                      )
                    }
                    disabled={linkingDocument}
                    accessibilityLabel="Create registration document"
                    style={styles.actionButton}
                  />
                </View>
              ) : null}
              {pendingDocumentLink &&
               selected.active &&
               pendingDocumentLink.carId === selected.id ? (
                <View style={styles.actionRow}>
                  <Button
                    variant="secondary"
                    label={linkingDocument ? 'Linking…' : 'Retry link'}
                    onPress={handleRetryPendingLink}
                    disabled={linkingDocument}
                    loading={linkingDocument}
                    accessibilityLabel="Retry document link"
                    style={styles.actionButton}
                  />
                </View>
              ) : null}
              <View style={styles.actionRow}>
                {selected.active ? (
                  <>
                    <Button
                      variant="secondary"
                      label="Edit"
                      onPress={startEdit}
                      disabled={linkingDocument}
                      accessibilityLabel="Edit Car"
                      style={styles.actionButton}
                    />
                    <Button
                      variant="outline"
                      label="Deactivate"
                      onPress={() => setDeactivateTarget(selected)}
                      disabled={linkingDocument}
                      accessibilityLabel="Deactivate Car"
                      style={styles.actionButton}
                    />
                    <Button
                      variant="outline"
                      label="Delete"
                      onPress={() => setDeleteTarget(selected)}
                      disabled={linkingDocument}
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
                      disabled={
                        reactivatingId === selected.id || linkingDocument
                      }
                      loading={reactivatingId === selected.id}
                      accessibilityLabel="Reactivate Car"
                      style={styles.actionButton}
                    />
                    <Button
                      variant="outline"
                      label="Delete"
                      onPress={() => setDeleteTarget(selected)}
                      disabled={linkingDocument}
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
                disabled={creating || documentPickerTarget != null}
                loading={creating}
                accessibilityLabel="Submit create Car"
                style={styles.modalActionButton}
              />
              <Button
                variant="outline"
                label="Cancel"
                onPress={closeCreateModal}
                disabled={creating || documentPickerTarget != null}
                accessibilityLabel="Cancel create Car"
                style={styles.modalActionButton}
              />
            </View>
          </View>
        </View>
      </Modal>

      <DocumentPickerModal
        visible={documentPickerTarget != null}
        title={`Choose ${documentPickerTarget?.role ?? ''} document`}
        documents={documents}
        loading={documentsLoading}
        error={documentsError}
        onRetry={() => void loadDocuments()}
        selectedDocumentId={documentPickerTarget
          ? existingLinkIdForTarget(documentPickerTarget.role, { kind: 'form', mode: documentPickerTarget.mode })
          : null}
        onClose={() => setDocumentPickerTarget(null)}
        onSelect={(document) => {
          if (!documentPickerTarget) return;
          const { mode, role } = documentPickerTarget;
          if (mode === 'edit' && (!editing || !selected?.active)) return;
          const setForm = mode === 'create' ? setCreateForm : setEditForm;
          setForm((form) => ({ ...form, [role === 'insurance' ? 'insuranceDocumentId' : 'registrationDocumentId']: document.id }));
          setDocumentPickerTarget(null);
        }}
      />

      <Modal
        visible={documentCreateSession != null}
        animationType="fade"
        transparent
        onRequestClose={closeDocumentCreateModal}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView
              style={styles.modalScroll}
              keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>
                {documentCreateSession?.role === 'registration'
                  ? 'Create registration document'
                  : 'Create insurance document'}
              </Text>
              {documentCreateSession ? (
                <DocumentCreateForm
                  key={documentCreateSession.formKey}
                  initialTitle={carDocumentPrefillTitle(
                    documentCreateSession.carLabel,
                    documentCreateSession.role
                  )}
                  initialTags={carDocumentPrefillTags(
                    documentCreateSession.role
                  )}
                  onDocumentCreated={handleDocumentCreated}
                  onSubmittingChange={setDocumentCreateSubmitting}
                />
              ) : null}
            </ScrollView>
            <View style={styles.modalActions}>
              <Button
                variant="outline"
                label="Cancel"
                onPress={closeDocumentCreateModal}
                disabled={documentCreateSubmitting}
                accessibilityLabel="Cancel create document"
                style={styles.modalActionButton}
              />
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        visible={replaceDocumentConfirm != null}
        title="Replace linked document?"
        message={
          replaceDocumentConfirm
            ? `Replace "${replaceDocumentConfirm.existingTitle}" with a new ${replaceDocumentConfirm.role} document?`
            : ''
        }
        confirmLabel="Replace"
        cancelLabel="Cancel"
        onCancel={() => setReplaceDocumentConfirm(null)}
        onConfirm={() => {
          if (!replaceDocumentConfirm) {
            return;
          }
          const pending = replaceDocumentConfirm;
          setReplaceDocumentConfirm(null);
          openDocumentCreateSession(
            pending.role,
            pending.apply,
            pending.carLabel
          );
        }}
      />

      <ConfirmDialog
        visible={retryLinkConfirm != null}
        title="Replace linked document?"
        message={
          retryLinkConfirm
            ? `Replace "${retryLinkConfirm.existingTitle}" with "${retryLinkConfirm.document.title}"?`
            : ''
        }
        confirmLabel="Replace"
        cancelLabel="Cancel"
        onCancel={() => setRetryLinkConfirm(null)}
        onConfirm={() => {
          const pending = retryLinkConfirm;
          setRetryLinkConfirm(null);
          if (pending) {
            void persistDocumentLink(
              pending.carId,
              pending.role,
              pending.document
            );
          }
        }}
      />

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
    </ManagerSection>
  );
}
