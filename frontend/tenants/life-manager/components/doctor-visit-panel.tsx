import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { TextInput } from '@/components/ui/text-input';
import { useAuth } from '@/contexts/AuthContext';
import { authenticatedFetch } from '@/lib/api/client';
import type { DoctorVisitDto, HealthMemberDto } from '@/lib/api/types';
import { useColorPalette } from '@/lib/tenant/TenantThemeContext';

import {
  NOTES_MAX_LEN,
  PROVIDER_NAME_MAX_LEN,
  REASON_MAX_LEN,
  buildCreateDoctorVisitCommand,
  buildUpdateDoctorVisitCommand,
  emptyDoctorVisitForm,
  formFromDoctorVisitDto,
  parseDoctorVisitDto,
  type DoctorVisitFormInput,
} from './doctor-visit-form-utils';

type DoctorVisitPanelProps = {
  selectedMember: HealthMemberDto | null;
};

function todayYmd(): string {
  // Match API validation: visited_on must not be after Utc::now().date_naive().
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Log doctor visits and manage the list for the selected HealthMember.
 *
 * ```
 * User -> Panel : select member (parent) / Add visit | Edit | Delete
 * Panel -> ManagerFormVsResults : collapsed until Add or Edit
 * Panel -> API : GET /doctor-visits?health_member_id=…
 * alt create
 *   Panel -> API : POST /doctor-visits
 *   Panel -> API : GET /doctor-visits (refresh)
 *   Panel -> ManagerFormVsResults : collapse
 * else edit
 *   Panel -> API : PUT /doctor-visits/{id}
 *   Panel -> API : GET /doctor-visits (refresh)
 *   Panel -> ManagerFormVsResults : collapse
 * else delete
 *   Panel -> ConfirmDialog : show
 *   User -> ConfirmDialog : confirm
 *   Panel -> API : DELETE /doctor-visits/{id}
 *   Panel -> API : GET /doctor-visits (refresh)
 * end
 * ```
 */
export default function DoctorVisitPanel({
  selectedMember,
}: DoctorVisitPanelProps) {
  const { token, handleUnauthorized } = useAuth();
  const palette = useColorPalette();

  const [form, setForm] = useState<DoctorVisitFormInput>(() =>
    emptyDoctorVisitForm(todayYmd())
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [visits, setVisits] = useState<DoctorVisitDto[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<ManagerFormMode>('collapsed');
  const [deleteTarget, setDeleteTarget] = useState<DoctorVisitDto | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadGenerationRef = useRef(0);
  const selectedMemberIdRef = useRef<string | null>(null);
  selectedMemberIdRef.current = selectedMember?.id ?? null;
  const prevMemberIdRef = useRef<string | null>(selectedMember?.id ?? null);

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
        formActions: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
        },
        historyHeader: {
          marginTop: 8,
          gap: 8,
        },
      }),
    [palette]
  );

  // Clear form and history when leaving a concrete member (A→B or A→null).
  useEffect(() => {
    const previousId = prevMemberIdRef.current;
    const nextId = selectedMember?.id ?? null;
    if (previousId !== nextId) {
      setForm(emptyDoctorVisitForm(todayYmd()));
      setFormError(null);
      setEditingId(null);
      setFormMode('collapsed');
      setDeleteTarget(null);
      setVisits([]);
      setListError(null);
    }
    prevMemberIdRef.current = nextId;
  }, [selectedMember?.id]);

  const updateField = useCallback(
    <K extends keyof DoctorVisitFormInput>(
      key: K,
      value: DoctorVisitFormInput[K]
    ) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const loadVisits = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
    if (!token || !selectedMember) {
      if (generation === loadGenerationRef.current) {
        setVisits([]);
        setListError(null);
        setListLoading(false);
      }
      return;
    }
    setListLoading(true);
    setListError(null);
    try {
      const path = `/doctor-visits?health_member_id=${encodeURIComponent(selectedMember.id)}`;
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
        ? (raw.map(parseDoctorVisitDto) as DoctorVisitDto[])
        : [];
      if (generation !== loadGenerationRef.current) {
        return;
      }
      setVisits(list);
    } catch (err: unknown) {
      if (generation !== loadGenerationRef.current) {
        return;
      }
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Failed to load visits';
      setListError(msg);
    } finally {
      if (generation === loadGenerationRef.current) {
        setListLoading(false);
      }
    }
  }, [token, selectedMember, handleUnauthorized]);

  useEffect(() => {
    void loadVisits();
  }, [loadVisits]);

  const formLocked =
    !token || !selectedMember?.active || submitting || deleting;
  const canSubmit = Boolean(token) && Boolean(selectedMember?.active) && !submitting;
  const isEditing = editingId != null;

  const collapseForm = useCallback(() => {
    setEditingId(null);
    setForm(emptyDoctorVisitForm(todayYmd()));
    setFormError(null);
    setFormMode('collapsed');
  }, []);

  const handleFormModeChange = useCallback((next: ManagerFormMode) => {
    if (next === 'create') {
      setEditingId(null);
      setForm(emptyDoctorVisitForm(todayYmd()));
      setFormError(null);
    } else if (next === 'collapsed') {
      setEditingId(null);
      setForm(emptyDoctorVisitForm(todayYmd()));
      setFormError(null);
    }
    setFormMode(next);
  }, []);

  const startEdit = (visit: DoctorVisitDto) => {
    setDeleteTarget(null);
    setEditingId(visit.id);
    setForm(formFromDoctorVisitDto(visit));
    setFormError(null);
    setFormMode('edit');
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!token) {
      setFormError('No authentication token available.');
      return;
    }
    if (!selectedMember) {
      setFormError('Select a HealthMember before saving a visit.');
      return;
    }
    if (!selectedMember.active) {
      setFormError('Selected HealthMember is inactive. Choose an active member.');
      return;
    }

    const memberIdAtSubmit = selectedMember.id;

    if (editingId) {
      const built = buildUpdateDoctorVisitCommand(form);
      if (!built.ok) {
        setFormError(built.error);
        return;
      }
      setSubmitting(true);
      try {
        const response = await authenticatedFetch(`/doctor-visits/${editingId}`, {
          method: 'PUT',
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
        if (selectedMemberIdRef.current === memberIdAtSubmit) {
          collapseForm();
          await loadVisits();
        }
      } catch (err: unknown) {
        console.error(err);
        const msg = err instanceof Error ? err.message : 'Failed to update visit';
        setFormError(msg);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const built = buildCreateDoctorVisitCommand(selectedMember.id, form);
    if (!built.ok) {
      setFormError(built.error);
      return;
    }

    setSubmitting(true);
    try {
      const response = await authenticatedFetch('/doctor-visits', {
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
      if (selectedMemberIdRef.current === memberIdAtSubmit) {
        setForm(emptyDoctorVisitForm(form.visitedOn || todayYmd()));
        setFormMode('collapsed');
        setEditingId(null);
        await loadVisits();
      }
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Failed to save visit';
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!token || !deleteTarget || deleting) {
      return;
    }
    const target = deleteTarget;
    const memberIdAtDelete = selectedMemberIdRef.current;
    setDeleting(true);
    try {
      const response = await authenticatedFetch(`/doctor-visits/${target.id}`, {
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
      // Skip UI refresh when the selected member changed during DELETE.
      if (selectedMemberIdRef.current === memberIdAtDelete) {
        setDeleteTarget(null);
        if (editingId === target.id) {
          collapseForm();
        }
        await loadVisits();
      } else {
        setDeleteTarget(null);
      }
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Failed to delete visit';
      if (selectedMemberIdRef.current === memberIdAtDelete) {
        setListError(msg);
      }
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  if (!token) {
    return (
      <View style={styles.container}>
        <ThemedText style={styles.hint}>
          Sign in to log and view doctor visits.
        </ThemedText>
      </View>
    );
  }

  const addDisabled =
    !selectedMember?.active || submitting || deleting;

  const emptyMessage = !selectedMember
    ? ''
    : !selectedMember.active
      ? 'Selected HealthMember is inactive. Choose an active member to add or edit visits.'
      : listError
        ? 'Visits could not be loaded.'
        : 'No visits yet.';

  const formHint = selectedMember?.active
    ? isEditing
      ? `Editing visit for ${selectedMember.display_name}.`
      : `Logging visits for ${selectedMember.display_name}.`
    : null;

  const visitForm = (
    <View style={styles.container} accessibilityLabel="Doctor visit form">
      {formHint ? <ThemedText style={styles.hint}>{formHint}</ThemedText> : null}

      <View style={styles.fieldBlock}>
        <FieldLabel label="Visit date" required />
        <DatePicker
          value={form.visitedOn}
          onChange={(value) => updateField('visitedOn', value)}
          accessibilityLabel="Visit date"
          disabled={formLocked}
        />
      </View>

      <View style={styles.fieldBlock}>
        <FieldLabel label="Provider name" />
        <TextInput
          editable={!formLocked}
          style={styles.input}
          value={form.providerName}
          onChangeText={(v) => updateField('providerName', v)}
          accessibilityLabel="Provider name"
          placeholder={`Optional (max ${PROVIDER_NAME_MAX_LEN})`}
          placeholderTextColor={palette.icon}
        />
      </View>

      <View style={styles.fieldBlock}>
        <FieldLabel label="Reason" />
        <TextInput
          editable={!formLocked}
          style={[styles.input, styles.inputMultiline]}
          value={form.reason}
          onChangeText={(v) => updateField('reason', v)}
          accessibilityLabel="Visit reason"
          multiline
          placeholder={`Optional (max ${REASON_MAX_LEN})`}
          placeholderTextColor={palette.icon}
        />
      </View>

      <View style={styles.fieldBlock}>
        <FieldLabel label="Notes" />
        <TextInput
          editable={!formLocked}
          style={[styles.input, styles.inputMultiline]}
          value={form.notes}
          onChangeText={(v) => updateField('notes', v)}
          accessibilityLabel="Visit notes"
          multiline
          placeholder={`Optional (max ${NOTES_MAX_LEN})`}
          placeholderTextColor={palette.icon}
        />
      </View>

      {formError ? (
        <Text style={styles.errorText} accessibilityRole="alert">
          {formError}
        </Text>
      ) : null}

      <View style={styles.formActions}>
        <ManagerCta
          variant="primary"
          label="Save visit"
          accessibilityLabel="Save visit"
          disabled={!canSubmit}
          onPress={() => {
            void handleSubmit();
          }}
        />
      </View>
    </View>
  );

  const visitResults = (
    <View style={styles.historyHeader} accessibilityLabel="Visit history">
      <ThemedText type="sectionTitle">Visit history</ThemedText>
      {listLoading && visits.length === 0 ? (
        <ManagerListSkeleton accessibilityLabel="Loading doctor visits" />
      ) : (
        <ManagerDataList
          testID="doctor-visit-data-list"
          leadingHeader="Date"
          columnHeaders={[
            { key: 'provider', label: 'Provider', primary: true },
            { key: 'reason', label: 'Reason' },
            { key: 'notes', label: 'Notes' },
          ]}
        >
          {visits.map((visit) => {
            const provider = visit.provider_name?.trim()
              ? visit.provider_name
              : MANAGER_DATA_EMPTY_CELL;
            const reason = visit.reason?.trim()
              ? visit.reason
              : MANAGER_DATA_EMPTY_CELL;
            const notes = visit.notes?.trim()
              ? visit.notes
              : MANAGER_DATA_EMPTY_CELL;
            return (
              <ManagerDataListRow
                key={visit.id}
                testID={`doctor-visit-row-${visit.id}`}
                accessibilityLabel={`Doctor visit on ${visit.visited_on}`}
                leading={visit.visited_on}
                cells={[
                  {
                    key: 'provider',
                    content: provider,
                    primary: true,
                    accessibilityLabel:
                      visit.provider_name?.trim()
                        ? `Provider: ${visit.provider_name}`
                        : 'Provider: none',
                  },
                  {
                    key: 'reason',
                    content: reason,
                    accessibilityLabel:
                      visit.reason?.trim()
                        ? `Reason: ${visit.reason}`
                        : 'Reason: none',
                  },
                  {
                    key: 'notes',
                    content: notes,
                    accessibilityLabel:
                      visit.notes?.trim()
                        ? `Notes: ${visit.notes}`
                        : 'Notes: none',
                  },
                ]}
                actions={
                  <>
                    <Button
                      variant="outline"
                      label="Edit"
                      accessibilityLabel={`Edit visit on ${visit.visited_on}`}
                      disabled={!selectedMember?.active || submitting || deleting}
                      onPress={() => startEdit(visit)}
                    />
                    <Button
                      variant="outline"
                      label="Delete"
                      accessibilityLabel={`Delete visit on ${visit.visited_on}`}
                      disabled={submitting || deleting}
                      onPress={() => setDeleteTarget(visit)}
                    />
                  </>
                }
              />
            );
          })}
        </ManagerDataList>
      )}
    </View>
  );

  return (
    <View style={styles.container} accessibilityLabel="Doctor visits panel">
      <ManagerSelectionContext
        entityNoun="HealthMember"
        selectedLabel={selectedMember?.display_name ?? null}
        inactive={selectedMember ? !selectedMember.active : false}
        emptyHint="Choose a HealthMember above to log doctor visits."
      />

      {listError ? (
        <Text style={styles.errorText} accessibilityRole="alert">
          {listError}
        </Text>
      ) : null}

      {selectedMember &&
      listLoading &&
      visits.length === 0 &&
      formMode === 'collapsed' ? (
        <ManagerListSkeleton accessibilityLabel="Loading doctor visits" />
      ) : (
        <ManagerFormVsResults
          itemCount={visits.length}
          addLabel="Add visit"
          emptyMessage={emptyMessage}
          addDisabled={addDisabled}
          addAccessibilityLabel="Add visit"
          mode={formMode}
          onModeChange={handleFormModeChange}
          onCancel={() => {
            if (submitting || deleting) {
              return false;
            }
          }}
          form={visitForm}
          onEnterSubmit={
            canSubmit
              ? () => {
                  void handleSubmit();
                }
              : undefined
          }
          results={visitResults}
          testID="doctor-visits-form-vs-results"
        />
      )}

      <ConfirmDialog
        visible={deleteTarget != null}
        title="Delete visit?"
        message={
          deleteTarget
            ? `Delete the visit on ${deleteTarget.visited_on}? This cannot be undone.`
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
