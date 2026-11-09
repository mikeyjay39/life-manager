import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { ManagerCta } from '@/components/ui/manager-cta';
import {
  ManagerFormVsResults,
  type ManagerFormMode,
} from '@/components/ui/manager-form-vs-results';
import { TextInput } from '@/components/ui/text-input';
import { useAuth } from '@/contexts/AuthContext';
import { authenticatedFetch } from '@/lib/api/client';
import type {
  CarDto,
  CarMaintenanceEventDto,
  DocumentDto,
} from '@/lib/api/types';
import { useColorPalette } from '@/lib/tenant/TenantThemeContext';

import { parseOwnedDocumentDto } from './car-panel';
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

type CarMaintenancePanelProps = {
  selectedCar: CarDto | null;
  /** Notify parent after create / update / delete so charts can reload. */
  onEventsChanged?: () => void;
};

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
 * Panel -> API : GET /documents
 * Panel -> API : GET /car-maintenance-events?car_id=…[&event_type=…]
 * alt create (form mode create; active Car only)
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

  const loadGenerationRef = useRef(0);
  const docsLoadGenerationRef = useRef(0);
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
          color: '#c62828',
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
        historyHeader: {
          marginTop: 8,
          gap: 4,
        },
        historyItem: {
          borderWidth: 1,
          borderColor: palette.icon,
          borderRadius: 8,
          padding: 10,
          gap: 6,
          backgroundColor: palette.background,
        },
        historyDate: {
          fontSize: 16,
          fontWeight: '600',
          color: palette.text,
        },
        historyLine: {
          fontSize: 14,
          color: palette.text,
        },
        historyMuted: {
          fontSize: 13,
          color: palette.icon,
        },
        rowActions: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
          marginTop: 4,
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
      if (generation === docsLoadGenerationRef.current) {
        setDocuments([]);
        setDocumentsError(null);
        setDocumentsLoading(false);
      }
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
    deleting;
  const canSubmitCreate =
    Boolean(token) && Boolean(selectedCar?.active) && !submitting && !deleting;
  const canSubmitEdit =
    Boolean(token) && Boolean(selectedCar) && !submitting && !deleting;
  const canSubmit = isEditing ? canSubmitEdit : canSubmitCreate;

  const collapseForm = useCallback(() => {
    setEditingId(null);
    setForm(emptyCarMaintenanceForm(todayYmd()));
    setFormError(null);
    setFormMode('collapsed');
  }, []);

  const handleFormModeChange = useCallback((next: ManagerFormMode) => {
    if (next === 'create') {
      setEditingId(null);
      setForm(emptyCarMaintenanceForm(todayYmd()));
      setFormError(null);
    } else if (next === 'collapsed') {
      setEditingId(null);
      setForm(emptyCarMaintenanceForm(todayYmd()));
      setFormError(null);
    }
    setFormMode(next);
  }, []);

  const startEdit = (event: CarMaintenanceEventDto) => {
    setDeleteTarget(null);
    setEditingId(event.id);
    setForm(formFromCarMaintenanceEventDto(event));
    setFormError(null);
    setFormMode('edit');
    void loadDocuments();
  };

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

  const addDisabled = !selectedCar?.active || submitting || deleting;

  const emptyMessage = !selectedCar
    ? 'Select or create a Car to log maintenance events.'
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
        {documentsLoading ? (
          <ActivityIndicator accessibilityLabel="Loading receipt documents" />
        ) : null}
        {documentsError ? (
          <Text
            style={styles.errorText}
            accessibilityRole="alert"
            accessibilityLabel="Receipt documents error">
            {documentsError}
          </Text>
        ) : null}
        {!documentsLoading && documents.length === 0 && !documentsError ? (
          <Text style={styles.hint} accessibilityLabel="Receipt documents empty">
            No documents yet. Choose None to clear a linked receipt.
          </Text>
        ) : null}
        {!documentsLoading ? (
          <View
            style={styles.picker}
            accessibilityLabel="Receipt document picker">
            <Pressable
              disabled={formInputsLocked}
              onPress={() => updateField('documentId', null)}
              accessibilityRole="button"
              accessibilityState={{
                selected: form.documentId == null,
                disabled: formInputsLocked,
              }}
              accessibilityLabel="Clear receipt document"
              style={[
                styles.pickerChip,
                form.documentId == null && styles.pickerChipSelected,
              ]}>
              <Text
                style={[
                  styles.pickerChipText,
                  form.documentId == null && styles.pickerChipTextSelected,
                ]}>
                None
              </Text>
            </Pressable>
            {documents.map((doc) => {
              const isSelected = doc.id === form.documentId;
              return (
                <Pressable
                  key={doc.id}
                  disabled={formInputsLocked}
                  onPress={() => updateField('documentId', doc.id)}
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: isSelected,
                    disabled: formInputsLocked,
                  }}
                  accessibilityLabel={`Select receipt document ${doc.title}`}
                  style={[
                    styles.pickerChip,
                    isSelected && styles.pickerChipSelected,
                  ]}>
                  <Text
                    style={[
                      styles.pickerChipText,
                      isSelected && styles.pickerChipTextSelected,
                    ]}>
                    {doc.title}
                  </Text>
                </Pressable>
              );
            })}
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

  const typeFilterBar = selectedCar ? (
    <View style={styles.historyHeader}>
      <ThemedText type="defaultSemiBold">Maintenance history</ThemedText>
      <View style={styles.picker} accessibilityLabel="Maintenance type filter">
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
    </View>
  ) : null;

  const historyResults = (
    <View accessibilityLabel="Maintenance history">
      {listLoading ? (
        <ActivityIndicator accessibilityLabel="Loading maintenance events" />
      ) : null}
      {events.map((event) => {
        const costLabel = formatCostCentsForDisplay(event.cost_cents);
        const typeLabel = eventTypeLabel(event.event_type);
        return (
          <View
            key={event.id}
            style={styles.historyItem}
            accessibilityLabel={`Maintenance event ${typeLabel} on ${event.occurred_on}`}>
            <Text style={styles.historyDate}>
              {event.occurred_on} · {typeLabel}
            </Text>
            {event.title ? (
              <Text style={styles.historyLine}>Title: {event.title}</Text>
            ) : null}
            {event.odometer_miles != null ? (
              <Text style={styles.historyLine}>
                Odometer: {event.odometer_miles} mi
              </Text>
            ) : null}
            {costLabel ? (
              <Text
                style={styles.historyLine}
                accessibilityLabel={`Cost ${costLabel}`}>
                Cost: {costLabel}
              </Text>
            ) : null}
            {event.notes ? (
              <Text style={styles.historyLine}>Notes: {event.notes}</Text>
            ) : null}
            {event.document_id ? (
              <Text style={styles.historyLine}>
                Receipt:{' '}
                {documentTitleById.get(event.document_id) ?? event.document_id}
              </Text>
            ) : null}
            <View style={styles.rowActions}>
              <Button
                variant="outline"
                label="Edit"
                accessibilityLabel={`Edit maintenance event ${event.id} on ${event.occurred_on}`}
                disabled={!selectedCar || submitting || deleting}
                onPress={() => startEdit(event)}
              />
              <Button
                variant="destructive"
                label="Delete"
                accessibilityLabel={`Delete maintenance event ${event.id} on ${event.occurred_on}`}
                disabled={!selectedCar || submitting || deleting}
                onPress={() => setDeleteTarget(event)}
              />
            </View>
          </View>
        );
      })}
    </View>
  );

  return (
    <View style={styles.container} accessibilityLabel="Maintenance events panel">
      {listError ? (
        <Text style={styles.errorText} accessibilityRole="alert">
          {listError}
        </Text>
      ) : null}

      {typeFilterBar}

      {selectedCar &&
      listLoading &&
      events.length === 0 &&
      formMode === 'collapsed' ? (
        <ActivityIndicator
          color={palette.tint}
          accessibilityLabel="Loading maintenance events"
        />
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
            if (submitting || deleting) {
              return false;
            }
          }}
          form={eventForm}
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
    </View>
  );
}
