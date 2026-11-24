import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DatePicker } from '@/components/ui/date-picker';
import { FieldLabel } from '@/components/ui/field-label';
import {
  MANAGER_DATA_EMPTY_CELL,
  ManagerDataList,
  ManagerDataListRow,
} from '@/components/ui/manager-data-list';
import { ManagerCta } from '@/components/ui/manager-cta';
import {
  ManagerFormVsResults,
  type ManagerFormMode,
} from '@/components/ui/manager-form-vs-results';
import { ManagerListSkeleton } from '@/components/ui/manager-list-skeleton';
import { ManagerSelectionContext } from '@/components/ui/manager-selection-context';
import { ManagerStickyFilterChrome } from '@/components/ui/manager-sticky-filter-chrome';
import { TextInput } from '@/components/ui/text-input';
import { useAuth } from '@/contexts/AuthContext';
import { authenticatedFetch } from '@/lib/api/client';
import type {
  CarDto,
  CarMaintenanceEventDto,
  DocumentDto,
} from '@/lib/api/types';
import {
  formatDisplayDate,
  formatDisplayInteger,
} from '@/lib/format/display';
import { useColorPalette } from '@/lib/tenant/TenantThemeContext';

import DocumentCreateForm from './document-create-form';
import { parseDocumentDto } from './document-create-form-utils';
import {
  mergeCreatedDocuments,
  pruneCreatedDocuments,
  type CreatedDocument,
} from './document-list-merge';
import DocumentPickerModal from './document-picker-modal';
import {
  CAR_MAINTENANCE_EVENT_TYPES,
  EVENT_TYPE_LABELS,
  NOTES_MAX_LEN,
  TITLE_MAX_LEN,
  buildCreateCarMaintenanceEventCommand,
  buildUpdateCarMaintenanceEventCommand,
  emptyCarMaintenanceForm,
  eventTypeLabel,
  formFromCarMaintenanceEventDto,
  formatCostCentsForDisplay,
  parseCarMaintenanceEventDto,
  type CarMaintenanceEventTypeValue,
  type CarMaintenanceFormInput,
} from './car-maintenance-form-utils';

/** Prefill title for a new receipt Document from the selected Car label. */
export function receiptDocumentTitlePrefill(carLabel: string): string {
  const trimmed = carLabel.trim();
  return trimmed ? `${trimmed} receipt` : 'receipt';
}

type CarMaintenancePanelProps = {
  selectedCar: CarDto | null;
  /** Notify parent after create / update / delete so charts can reload. */
  onEventsChanged?: () => void;
};

/**
 * Wide-row flex weights for maintenance history.
 * Title gets the largest share so multi-word event names stay scannable.
 * Notes and Receipt stay below Title; Type stays the primary label column.
 */
export const CAR_MAINTENANCE_LIST_COLUMN_FLEX = {
  type: 1.25,
  title: 2.75,
  odometer: 1,
  cost: 0.9,
  notes: 1.25,
  receipt: 1.1,
} as const;

function todayYmd(): string {
  // Match API validation: occurred_on must not be after Utc::now().date_naive().
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Log maintenance events and manage history for the selected Car.
 *
 * ```
 * User -> Panel : select Car (parent) / Add event | Edit | Delete
 * Panel -> ManagerFormVsResults : collapsed until Add or Edit
 * Panel -> ManagerDataList : dense history rows when events exist
 * Panel -> API : GET /documents
 * Panel -> API : GET /car-maintenance-events?car_id=…[&event_type=…]
 * alt choose / change receipt
 *   Panel -> DocumentPickerModal : authorized documents + current id
 *   User -> DocumentPickerModal : search / stage choice
 *   alt Select document
 *     DocumentPickerModal -> Panel : DocumentDto; set form id only
 *   else Cancel / Close / Escape / back
 *     DocumentPickerModal -> Panel : close; preserve form
 *   end
 * else remove receipt
 *   Panel -> form : clear documentId only; do not delete Document
 * end
 * alt create receipt Document (active Car; form open)
 *   alt form.documentId already set
 *     Panel -> ConfirmDialog : replace receipt link?
 *     User -> ConfirmDialog : cancel --> keep old id
 *     User -> ConfirmDialog : confirm --> open DocumentCreateForm
 *   else
 *     Panel -> DocumentCreateForm : open (title/tag prefill)
 *   end
 *   DocumentCreateForm -> API : POST /documents
 *   DocumentCreateForm -> Panel : DocumentDto (skipped if the form unmounted)
 *   Panel -> Panel : add receipt to documents; keep it if an older GET /documents returns without it
 *   Panel -> form : set documentId only (event Save still owns POST/PUT)
 * else create event (form mode create; active Car only)
 *   Panel -> API : POST /car-maintenance-events
 *   Panel -> API : GET /car-maintenance-events (refresh)
 *   Panel -> Parent : onEventsChanged (charts refresh)
 *   Panel -> ManagerFormVsResults : collapse
 * else edit (form mode edit; allowed on inactive Car)
 *   Panel -> API : PUT /car-maintenance-events/{id}
 *   Panel -> API : GET /car-maintenance-events (refresh)
 *   Panel -> Parent : onEventsChanged (charts refresh)
 *   Panel -> ManagerFormVsResults : collapse
 * else delete
 *   Panel -> ConfirmDialog : show
 *   User -> ConfirmDialog : confirm
 *   Panel -> API : DELETE /car-maintenance-events/{id}
 *   Panel -> API : GET /car-maintenance-events (refresh)
 *   Panel -> Parent : onEventsChanged (charts refresh)
 * end
 * ```
 */
export default function CarMaintenancePanel({
  selectedCar,
  onEventsChanged,
}: CarMaintenancePanelProps) {
  const { token, handleUnauthorized } = useAuth();
  const palette = useColorPalette();

  const [form, setForm] = useState<CarMaintenanceFormInput>(() =>
    emptyCarMaintenanceForm(todayYmd())
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [events, setEvents] = useState<CarMaintenanceEventDto[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<CarMaintenanceEventTypeValue | null>(
    null
  );

  const [documents, setDocuments] = useState<DocumentDto[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<ManagerFormMode>('collapsed');
  const [deleteTarget, setDeleteTarget] = useState<CarMaintenanceEventDto | null>(
    null
  );
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);
  const [receiptCreateOpen, setReceiptCreateOpen] = useState(false);
  const [receiptPickerOpen, setReceiptPickerOpen] = useState(false);
  const [receiptCreateSubmitting, setReceiptCreateSubmitting] = useState(false);
  const [replaceReceiptConfirmVisible, setReplaceReceiptConfirmVisible] =
    useState(false);

  const loadGenerationRef = useRef(0);
  const docsLoadGenerationRef = useRef(0);
  const documentSequenceRef = useRef(0);
  const createdReceiptsRef = useRef<CreatedDocument[]>([]);
  const selectedCarIdRef = useRef<string | null>(null);
  selectedCarIdRef.current = selectedCar?.id ?? null;
  const prevCarIdRef = useRef<string | null>(selectedCar?.id ?? null);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          gap: 12,
        },
        hint: {
          fontSize: 14,
          color: palette.icon,
        },
        errorText: {
          fontSize: 14,
          color: palette.danger,
        },
        fieldBlock: {
          gap: 4,
        },
        input: {
          borderWidth: 1,
          borderColor: palette.icon,
          borderRadius: 8,
          padding: 10,
          color: palette.text,
          backgroundColor: palette.background,
        },
        inputMultiline: {
          minHeight: 72,
          textAlignVertical: 'top',
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
        pickerChipText: {
          color: palette.text,
          fontSize: 15,
        },
        pickerChipTextSelected: {
          color: palette.onTint,
          fontWeight: '600',
        },
        formActions: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
        },
        receiptCreateBlock: {
          gap: 8,
          marginTop: 4,
        },
        historyHeader: {
          marginTop: 8,
        },
      }),
    [palette]
  );

  const documentTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const doc of documents) {
      map.set(doc.id, doc.title);
    }
    return map;
  }, [documents]);

  // Clear form and history when leaving a concrete Car (A→B or A→null).
  useEffect(() => {
    const previousId = prevCarIdRef.current;
    const nextId = selectedCar?.id ?? null;
    if (previousId !== nextId) {
      setForm(emptyCarMaintenanceForm(todayYmd()));
      setFormError(null);
      setEditingId(null);
      setFormMode('collapsed');
      setDeleteTarget(null);
      setTypeFilter(null);
      setEvents([]);
      setListError(null);
      setReceiptCreateOpen(false);
      setReceiptPickerOpen(false);
      setReceiptCreateSubmitting(false);
      setReplaceReceiptConfirmVisible(false);
    }
    prevCarIdRef.current = nextId;
  }, [selectedCar?.id]);

  const updateField = useCallback(
    <K extends keyof CarMaintenanceFormInput>(
      key: K,
      value: CarMaintenanceFormInput[K]
    ) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const loadDocuments = useCallback(async () => {
    const generation = ++docsLoadGenerationRef.current;
    if (!token) {
      createdReceiptsRef.current = [];
      if (generation === docsLoadGenerationRef.current) {
        setDocuments([]);
        setDocumentsError(null);
        setDocumentsLoading(false);
      }
      return;
    }
    const getStartedSequence = documentSequenceRef.current;
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
      const list = Array.isArray(raw) ? raw.map(parseDocumentDto) : [];
      if (generation !== docsLoadGenerationRef.current) {
        return;
      }
      setDocuments(
        mergeCreatedDocuments(list, createdReceiptsRef.current, getStartedSequence)
      );
      createdReceiptsRef.current = pruneCreatedDocuments(
        createdReceiptsRef.current,
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
      // A failed GET covers no receipt, so keep every created one.
      setDocuments(createdReceiptsRef.current.map((receipt) => receipt.document));
    } finally {
      if (generation === docsLoadGenerationRef.current) {
        setDocumentsLoading(false);
      }
    }
  }, [token, handleUnauthorized]);

  const loadEvents = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
    if (!token || !selectedCar) {
      if (generation === loadGenerationRef.current) {
        setEvents([]);
        setListError(null);
        setListLoading(false);
      }
      return;
    }
    setListLoading(true);
    setListError(null);
    try {
      const params = new URLSearchParams({
        car_id: selectedCar.id,
      });
      if (typeFilter) {
        params.set('event_type', typeFilter);
      }
      const path = `/car-maintenance-events?${params.toString()}`;
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
      const list = Array.isArray(raw)
        ? (raw.map(parseCarMaintenanceEventDto) as CarMaintenanceEventDto[])
        : [];
      if (generation !== loadGenerationRef.current) {
        return;
      }
      setEvents(list);
    } catch (err: unknown) {
      if (generation !== loadGenerationRef.current) {
        return;
      }
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Failed to load events';
      setListError(msg);
      setEvents([]);
    } finally {
      if (generation === loadGenerationRef.current) {
        setListLoading(false);
      }
    }
  }, [token, selectedCar, typeFilter, handleUnauthorized]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const isEditing = editingId != null;
  const createLocked =
    !token || !selectedCar?.active || submitting || deleting;
  const formInputsLocked =
    !token ||
    !selectedCar ||
    (createLocked && !isEditing) ||
    submitting ||
    deleting ||
    receiptCreateSubmitting;
  const canSubmitCreate =
    Boolean(token) &&
    Boolean(selectedCar?.active) &&
    !submitting &&
    !deleting &&
    !receiptPickerOpen &&
    !receiptCreateOpen &&
    !receiptCreateSubmitting;
  const canSubmitEdit =
    Boolean(token) &&
    Boolean(selectedCar) &&
    !submitting &&
    !deleting &&
    !receiptPickerOpen &&
    !receiptCreateOpen &&
    !receiptCreateSubmitting;
  const canSubmit = isEditing ? canSubmitEdit : canSubmitCreate;
  const listActionsLocked =
    !selectedCar || submitting || deleting || receiptCreateSubmitting || receiptPickerOpen;
  // Active Car only: no new receipt create when Add-event create is blocked.
  const canCreateReceiptDocument =
    Boolean(selectedCar?.active) && !formInputsLocked && !receiptCreateOpen;

  const closeReceiptCreate = useCallback(() => {
    setReceiptCreateOpen(false);
    setReceiptCreateSubmitting(false);
    setReplaceReceiptConfirmVisible(false);
  }, []);

  const collapseForm = useCallback(() => {
    setReceiptPickerOpen(false);
    setEditingId(null);
    setForm(emptyCarMaintenanceForm(todayYmd()));
    setFormError(null);
    setFormMode('collapsed');
    closeReceiptCreate();
  }, [closeReceiptCreate]);

  const handleFormModeChange = useCallback(
    (next: ManagerFormMode) => {
      setReceiptPickerOpen(false);
      if (next === 'create') {
        setEditingId(null);
        setForm(emptyCarMaintenanceForm(todayYmd()));
        setFormError(null);
        closeReceiptCreate();
      } else if (next === 'collapsed') {
        setEditingId(null);
        setForm(emptyCarMaintenanceForm(todayYmd()));
        setFormError(null);
        closeReceiptCreate();
      }
      setFormMode(next);
    },
    [closeReceiptCreate]
  );

  const startEdit = (event: CarMaintenanceEventDto) => {
    setReceiptPickerOpen(false);
    setDeleteTarget(null);
    setEditingId(event.id);
    setForm(formFromCarMaintenanceEventDto(event));
    setFormError(null);
    setFormMode('edit');
    closeReceiptCreate();
    void loadDocuments();
  };

  const openReceiptCreate = useCallback(() => {
    setReplaceReceiptConfirmVisible(false);
    setReceiptCreateOpen(true);
  }, []);

  const handleCreateReceiptPress = useCallback(() => {
    if (form.documentId) {
      setReplaceReceiptConfirmVisible(true);
      return;
    }
    openReceiptCreate();
  }, [form.documentId, openReceiptCreate]);

  const handleReceiptDocumentCreated = useCallback(
    (document: DocumentDto) => {
      // An in-flight GET can return without this receipt; see document-list-merge.
      createdReceiptsRef.current = [
        ...createdReceiptsRef.current,
        { document, createdSequence: ++documentSequenceRef.current },
      ];
      setDocuments((prev) => {
        if (prev.some((d) => d.id === document.id)) {
          return prev.map((d) => (d.id === document.id ? document : d));
        }
        return [document, ...prev];
      });
      updateField('documentId', document.id);
      setReceiptCreateOpen(false);
      setReceiptCreateSubmitting(false);
    },
    [updateField]
  );

  const handleSubmit = async () => {
    setFormError(null);
    if (!token) {
      setFormError('No authentication token available.');
      return;
    }
    if (!selectedCar) {
      setFormError('Select a Car before saving a maintenance event.');
      return;
    }

    const carIdAtSubmit = selectedCar.id;

    if (editingId) {
      const built = buildUpdateCarMaintenanceEventCommand(form);
      if (!built.ok) {
        setFormError(built.error);
        return;
      }
      setSubmitting(true);
      try {
        const response = await authenticatedFetch(
          `/car-maintenance-events/${editingId}`,
          {
            method: 'PUT',
            token,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(built.command),
            onUnauthorized: handleUnauthorized,
          }
        );
        const bodyText = await response.text();
        if (!response.ok) {
          throw new Error(
            bodyText
              ? `Request failed (${response.status}): ${bodyText}`
              : `Request failed with status ${response.status}`
          );
        }
        if (selectedCarIdRef.current === carIdAtSubmit) {
          collapseForm();
          await loadEvents();
          onEventsChanged?.();
        }
      } catch (err: unknown) {
        console.error(err);
        const msg =
          err instanceof Error ? err.message : 'Failed to update event';
        setFormError(msg);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!selectedCar.active) {
      setFormError('Selected Car is inactive. Choose an active Car to add events.');
      return;
    }

    const built = buildCreateCarMaintenanceEventCommand(selectedCar.id, form);
    if (!built.ok) {
      setFormError(built.error);
      return;
    }

    setSubmitting(true);
    try {
      const response = await authenticatedFetch('/car-maintenance-events', {
        method: 'POST',
        token,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(built.command),
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
      if (selectedCarIdRef.current === carIdAtSubmit) {
        collapseForm();
        await loadEvents();
        onEventsChanged?.();
      }
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Failed to save event';
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!token || !deleteTarget || deletingRef.current) {
      return;
    }
    const target = deleteTarget;
    const carIdAtDelete = selectedCarIdRef.current;
    deletingRef.current = true;
    setDeleting(true);
    setDeleteTarget(null);
    const previousList = events;
    // Optimistic remove so a second confirm cannot revive the row after 404.
    setEvents((prev) => prev.filter((e) => e.id !== target.id));
    if (editingId === target.id) {
      collapseForm();
    }
    try {
      const response = await authenticatedFetch(
        `/car-maintenance-events/${target.id}`,
        {
          method: 'DELETE',
          token,
          onUnauthorized: handleUnauthorized,
        }
      );
      // 404: already gone — keep optimistic removal.
      if (!response.ok && response.status !== 204 && response.status !== 404) {
        const bodyText = await response.text();
        throw new Error(
          bodyText
            ? `Request failed (${response.status}): ${bodyText}`
            : `Request failed with status ${response.status}`
        );
      }
      if (selectedCarIdRef.current === carIdAtDelete) {
        await loadEvents();
        onEventsChanged?.();
      }
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Failed to delete event';
      if (selectedCarIdRef.current === carIdAtDelete) {
        setListError(msg);
        setEvents(previousList);
      }
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  };

  if (!token) {
    return (
      <View style={styles.container}>
        <ThemedText style={styles.hint}>
          Sign in to log and view maintenance events.
        </ThemedText>
      </View>
    );
  }

  const carLabel = selectedCar
    ? selectedCar.display_name?.trim() ||
      `${selectedCar.year} ${selectedCar.make} ${selectedCar.model}`
    : null;

  const addDisabled =
    !selectedCar?.active ||
    submitting ||
    deleting ||
    receiptCreateSubmitting;

  const emptyMessage = !selectedCar
    ? ''
    : !selectedCar.active
      ? 'Selected Car is inactive. You can edit or delete past events. Choose an active Car to add new ones.'
      : listError
        ? 'Maintenance events could not be loaded.'
        : typeFilter
          ? 'No matching maintenance events.'
          : 'No maintenance events yet.';

  const formHint = !selectedCar
    ? null
    : isEditing
      ? `Editing event for ${carLabel}.`
      : `Logging maintenance for ${carLabel}.`;

  const eventForm = (
    <View style={styles.container} accessibilityLabel="Maintenance event form">
      {formHint ? <ThemedText style={styles.hint}>{formHint}</ThemedText> : null}

      <View style={styles.fieldBlock}>
        <FieldLabel label="Event date" required />
        <DatePicker
          value={form.occurredOn}
          onChange={(value) => updateField('occurredOn', value)}
          accessibilityLabel="Maintenance event date"
          disabled={formInputsLocked}
        />
      </View>

      <View style={styles.fieldBlock}>
        <FieldLabel label="Event type" required />
        <View
          style={styles.picker}
          accessibilityLabel="Maintenance event type picker">
          {CAR_MAINTENANCE_EVENT_TYPES.map((type) => {
            const isSelected = form.eventType === type;
            return (
              <Pressable
                key={type}
                disabled={formInputsLocked}
                onPress={() => updateField('eventType', type)}
                accessibilityRole="button"
                accessibilityState={{
                  selected: isSelected,
                  disabled: formInputsLocked,
                }}
                accessibilityLabel={`Select event type ${EVENT_TYPE_LABELS[type]}`}
                style={[
                  styles.pickerChip,
                  isSelected && styles.pickerChipSelected,
                ]}>
                <Text
                  style={[
                    styles.pickerChipText,
                    isSelected && styles.pickerChipTextSelected,
                  ]}>
                  {EVENT_TYPE_LABELS[type]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.fieldBlock}>
        <FieldLabel label="Odometer miles" />
        <TextInput
          editable={!formInputsLocked}
          style={styles.input}
          value={form.odometerMiles}
          onChangeText={(v) => updateField('odometerMiles', v)}
          accessibilityLabel="Maintenance odometer miles"
          keyboardType="number-pad"
          placeholder="Optional"
          placeholderTextColor={palette.icon}
        />
      </View>

      <View style={styles.fieldBlock}>
        <FieldLabel label="Cost (dollars)" />
        <TextInput
          editable={!formInputsLocked}
          style={styles.input}
          value={form.costDollars}
          onChangeText={(v) => updateField('costDollars', v)}
          accessibilityLabel="Maintenance cost in dollars"
          keyboardType="decimal-pad"
          placeholder="Optional (e.g. 59.99)"
          placeholderTextColor={palette.icon}
        />
      </View>

      <View style={styles.fieldBlock}>
        <FieldLabel label="Title" />
        <TextInput
          editable={!formInputsLocked}
          style={styles.input}
          value={form.title}
          onChangeText={(v) => updateField('title', v)}
          accessibilityLabel="Maintenance title"
          placeholder={`Optional (max ${TITLE_MAX_LEN})`}
          placeholderTextColor={palette.icon}
        />
      </View>

      <View style={styles.fieldBlock}>
        <FieldLabel label="Notes" />
        <TextInput
          editable={!formInputsLocked}
          style={[styles.input, styles.inputMultiline]}
          value={form.notes}
          onChangeText={(v) => updateField('notes', v)}
          accessibilityLabel="Maintenance notes"
          multiline
          placeholder={`Optional (max ${NOTES_MAX_LEN})`}
          placeholderTextColor={palette.icon}
        />
      </View>

      <View style={styles.fieldBlock}>
        <FieldLabel label="Receipt document" />
        {form.documentId ? (
          <ThemedText accessibilityLabel="Linked receipt document">
            {documentTitleById.get(form.documentId) ?? 'Document unavailable'}
          </ThemedText>
        ) : null}
        <View style={styles.formActions}>
          <Button
            variant="outline"
            label={form.documentId ? 'Change' : 'Choose document'}
            accessibilityLabel={form.documentId ? 'Change receipt document' : 'Choose receipt document'}
            disabled={formInputsLocked || receiptCreateOpen}
            onPress={() => setReceiptPickerOpen(true)}
          />
          {form.documentId ? (
            <Button
              variant="outline"
              label="Remove"
              accessibilityLabel="Remove receipt document"
              disabled={formInputsLocked || receiptCreateOpen}
              onPress={() => updateField('documentId', null)}
            />
          ) : null}
        </View>
        {canCreateReceiptDocument ? (
          <View style={styles.formActions}>
            <Button
              variant="outline"
              label="Create receipt"
              accessibilityLabel="Create receipt document"
              disabled={formInputsLocked}
              onPress={handleCreateReceiptPress}
            />
          </View>
        ) : null}
        {receiptCreateOpen && carLabel ? (
          <View
            style={styles.receiptCreateBlock}
            accessibilityLabel="Create receipt document form">
            <ThemedText style={styles.hint}>
              Create a receipt Document. Save the event to store the link.
            </ThemedText>
            <DocumentCreateForm
              key={`receipt-create-${selectedCar?.id ?? 'none'}`}
              initialTitle={receiptDocumentTitlePrefill(carLabel)}
              initialTags="receipt"
              onDocumentCreated={handleReceiptDocumentCreated}
              onSubmittingChange={setReceiptCreateSubmitting}
            />
            <View style={styles.formActions}>
              <Button
                variant="outline"
                label="Cancel create"
                accessibilityLabel="Cancel create receipt document"
                disabled={receiptCreateSubmitting}
                onPress={closeReceiptCreate}
              />
            </View>
          </View>
        ) : null}
      </View>

      {formError ? (
        <Text style={styles.errorText} accessibilityRole="alert">
          {formError}
        </Text>
      ) : null}

      <View style={styles.formActions}>
        <ManagerCta
          variant="primary"
          label={isEditing ? 'Update event' : 'Save event'}
          accessibilityLabel={
            isEditing ? 'Update maintenance event' : 'Save maintenance event'
          }
          disabled={!canSubmit || formInputsLocked}
          loading={submitting}
          onPress={() => {
            void handleSubmit();
          }}
        />
      </View>
    </View>
  );

  // Sticky chrome must be a direct child of the panel container (sibling of
  // results), not nested in a short header — CSS sticky stops at the parent box.
  const typeFilterTitle = selectedCar ? (
    <ThemedText type="sectionTitle" style={styles.historyHeader}>
      Maintenance history
    </ThemedText>
  ) : null;

  const typeFilterChrome = selectedCar ? (
    <ManagerStickyFilterChrome
      accessibilityLabel="Maintenance type filter"
      testID="car-maintenance-type-filter-chrome"
    >
      <View style={styles.picker}>
        <Pressable
          onPress={() => setTypeFilter(null)}
          accessibilityRole="button"
          accessibilityState={{ selected: typeFilter == null }}
          accessibilityLabel="Filter all event types"
          style={[
            styles.pickerChip,
            typeFilter == null && styles.pickerChipSelected,
          ]}>
          <Text
            style={[
              styles.pickerChipText,
              typeFilter == null && styles.pickerChipTextSelected,
            ]}>
            All
          </Text>
        </Pressable>
        {CAR_MAINTENANCE_EVENT_TYPES.map((type) => {
          const isSelected = typeFilter === type;
          return (
            <Pressable
              key={`filter-${type}`}
              onPress={() => setTypeFilter(type)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`Filter ${EVENT_TYPE_LABELS[type]} events`}
              style={[
                styles.pickerChip,
                isSelected && styles.pickerChipSelected,
              ]}>
              <Text
                style={[
                  styles.pickerChipText,
                  isSelected && styles.pickerChipTextSelected,
                ]}>
                {EVENT_TYPE_LABELS[type]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ManagerStickyFilterChrome>
  ) : null;

  const historyResults = (
    <View accessibilityLabel="Maintenance history">
      {listLoading && events.length === 0 ? (
        <ManagerListSkeleton accessibilityLabel="Loading maintenance events" />
      ) : null}
      {events.length > 0 ? (
        <ManagerDataList
          accessibilityLabel="Maintenance event list"
          testID="car-maintenance-data-list"
          leadingHeader="Date"
          columnHeaders={[
            {
              key: 'type',
              label: 'Type',
              primary: true,
              flex: CAR_MAINTENANCE_LIST_COLUMN_FLEX.type,
            },
            {
              key: 'title',
              label: 'Title',
              flex: CAR_MAINTENANCE_LIST_COLUMN_FLEX.title,
            },
            {
              key: 'odometer',
              label: 'Odometer',
              flex: CAR_MAINTENANCE_LIST_COLUMN_FLEX.odometer,
            },
            {
              key: 'cost',
              label: 'Cost',
              flex: CAR_MAINTENANCE_LIST_COLUMN_FLEX.cost,
            },
            {
              key: 'notes',
              label: 'Notes',
              flex: CAR_MAINTENANCE_LIST_COLUMN_FLEX.notes,
            },
            {
              key: 'receipt',
              label: 'Receipt',
              flex: CAR_MAINTENANCE_LIST_COLUMN_FLEX.receipt,
            },
          ]}
        >
          {events.map((event) => {
            const costLabel = formatCostCentsForDisplay(event.cost_cents);
            const typeLabel = eventTypeLabel(event.event_type);
            const receiptTitle = event.document_id
              ? (documentTitleById.get(event.document_id) ?? event.document_id)
              : null;
            const title = event.title?.trim()
              ? event.title
              : MANAGER_DATA_EMPTY_CELL;
            const odometerMiles = formatDisplayInteger(event.odometer_miles);
            const odometer =
              odometerMiles != null
                ? `${odometerMiles} mi`
                : MANAGER_DATA_EMPTY_CELL;
            const cost = costLabel ?? MANAGER_DATA_EMPTY_CELL;
            const notes = event.notes?.trim()
              ? event.notes
              : MANAGER_DATA_EMPTY_CELL;
            const receipt = receiptTitle ?? MANAGER_DATA_EMPTY_CELL;
            const occurredLabel = formatDisplayDate(event.occurred_on);
            return (
              <ManagerDataListRow
                key={event.id}
                testID={`car-maintenance-row-${event.id}`}
                accessibilityLabel={`Maintenance event ${typeLabel} on ${event.occurred_on}`}
                leading={occurredLabel}
                cells={[
                  {
                    key: 'type',
                    content: typeLabel,
                    primary: true,
                    flex: CAR_MAINTENANCE_LIST_COLUMN_FLEX.type,
                    accessibilityLabel: typeLabel,
                  },
                  {
                    key: 'title',
                    content: title,
                    flex: CAR_MAINTENANCE_LIST_COLUMN_FLEX.title,
                    accessibilityLabel: event.title?.trim()
                      ? `Title: ${event.title}`
                      : 'Title: none',
                  },
                  {
                    key: 'odometer',
                    content: odometer,
                    flex: CAR_MAINTENANCE_LIST_COLUMN_FLEX.odometer,
                    accessibilityLabel:
                      odometerMiles != null
                        ? `Odometer: ${odometerMiles} mi`
                        : 'Odometer: none',
                  },
                  {
                    key: 'cost',
                    content: cost,
                    flex: CAR_MAINTENANCE_LIST_COLUMN_FLEX.cost,
                    accessibilityLabel: costLabel
                      ? `Cost ${costLabel}`
                      : 'Cost: none',
                  },
                  {
                    key: 'notes',
                    content: notes,
                    flex: CAR_MAINTENANCE_LIST_COLUMN_FLEX.notes,
                    accessibilityLabel: event.notes?.trim()
                      ? `Notes: ${event.notes}`
                      : 'Notes: none',
                  },
                  {
                    key: 'receipt',
                    content: receipt,
                    flex: CAR_MAINTENANCE_LIST_COLUMN_FLEX.receipt,
                    accessibilityLabel: receiptTitle
                      ? `Receipt: ${receiptTitle}`
                      : 'Receipt: none',
                  },
                ]}
                actions={
                  <>
                    <Button
                      variant="outline"
                      label="Edit"
                      accessibilityLabel={`Edit maintenance event ${event.id} on ${event.occurred_on}`}
                      disabled={listActionsLocked}
                      onPress={() => startEdit(event)}
                    />
                    <Button
                      variant="outline"
                      label="Delete"
                      accessibilityLabel={`Delete maintenance event ${event.id} on ${event.occurred_on}`}
                      disabled={listActionsLocked}
                      onPress={() => setDeleteTarget(event)}
                    />
                  </>
                }
              />
            );
          })}
        </ManagerDataList>
      ) : null}
    </View>
  );

  return (
    <View style={styles.container} accessibilityLabel="Maintenance events panel">
      <ManagerSelectionContext
        entityNoun="Car"
        selectedLabel={carLabel}
        inactive={selectedCar ? !selectedCar.active : false}
        emptyHint="Choose a Car above to log maintenance events."
      />

      {listError ? (
        <Text style={styles.errorText} accessibilityRole="alert">
          {listError}
        </Text>
      ) : null}

      {typeFilterTitle}
      {typeFilterChrome}

      {selectedCar &&
      listLoading &&
      events.length === 0 &&
      formMode === 'collapsed' ? (
        <ManagerListSkeleton accessibilityLabel="Loading maintenance events" />
      ) : (
        <ManagerFormVsResults
          itemCount={events.length}
          addLabel="Add event"
          emptyMessage={emptyMessage}
          addDisabled={addDisabled}
          addAccessibilityLabel="Add maintenance event"
          mode={formMode}
          onModeChange={handleFormModeChange}
          onCancel={() => {
            if (submitting || deleting || receiptCreateSubmitting) {
              return false;
            }
            closeReceiptCreate();
          }}
          form={eventForm}
          onEnterSubmit={
            canSubmit && !formInputsLocked
              ? () => {
                  void handleSubmit();
                }
              : undefined
          }
          results={historyResults}
          testID="car-maintenance-form-vs-results"
        />
      )}

      <ConfirmDialog
        visible={deleteTarget != null}
        title="Delete maintenance event?"
        message={
          deleteTarget
            ? `Delete the ${eventTypeLabel(deleteTarget.event_type)} event on ${deleteTarget.occurred_on}? This cannot be undone.`
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
        onConfirm={() => {
          void handleDeleteConfirm();
        }}
      />

      <ConfirmDialog
        visible={replaceReceiptConfirmVisible}
        title="Replace receipt document?"
        message="This event already has a receipt Document. Create a new receipt and replace the link? Cancel keeps the current receipt."
        confirmLabel="Replace"
        cancelLabel="Cancel"
        onCancel={() => {
          setReplaceReceiptConfirmVisible(false);
        }}
        onConfirm={openReceiptCreate}
      />
      <DocumentPickerModal
        key={`receipt-picker-${selectedCar?.id ?? 'none'}-${editingId ?? formMode}`}
        visible={receiptPickerOpen && formMode !== 'collapsed'}
        title="Choose receipt document"
        documents={documents}
        selectedDocumentId={form.documentId}
        loading={documentsLoading}
        error={documentsError}
        onRetry={() => { void loadDocuments(); }}
        onSelect={(document) => {
          updateField('documentId', document.id);
          setReceiptPickerOpen(false);
        }}
        onClose={() => setReceiptPickerOpen(false)}
      />
    </View>
  );
}
