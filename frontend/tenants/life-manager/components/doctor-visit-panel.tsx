import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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

  // Clear form when leaving a concrete member (A→B or A→null).
  useEffect(() => {
    const previousId = prevMemberIdRef.current;
    const nextId = selectedMember?.id ?? null;
    if (previousId !== nextId) {
      setForm(emptyDoctorVisitForm(todayYmd()));
      setFormError(null);
      setEditingId(null);
      setFormMode('collapsed');
      setDeleteTarget(null);
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
    ? 'Select or create a HealthMember to log doctor visits.'
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
      <ThemedText type="defaultSemiBold">Visit history</ThemedText>
      {listLoading ? (
        <ActivityIndicator accessibilityLabel="Loading doctor visits" />
      ) : null}
      {!listLoading
        ? visits.map((visit) => (
            <View
              key={visit.id}
              style={styles.historyItem}
              accessibilityLabel={`Doctor visit on ${visit.visited_on}`}>
              <Text style={styles.historyDate}>{visit.visited_on}</Text>
              {visit.provider_name ? (
                <Text style={styles.historyLine}>
                  Provider: {visit.provider_name}
                </Text>
              ) : null}
              {visit.reason ? (
                <Text style={styles.historyLine}>Reason: {visit.reason}</Text>
              ) : null}
              {visit.notes ? (
                <Text style={styles.historyLine}>Notes: {visit.notes}</Text>
              ) : null}
              <View style={styles.rowActions}>
                <Button
                  variant="outline"
                  label="Edit"
                  accessibilityLabel={`Edit visit on ${visit.visited_on}`}
                  disabled={!selectedMember?.active || submitting || deleting}
                  onPress={() => startEdit(visit)}
                />
                <Button
                  variant="destructive"
                  label="Delete"
                  accessibilityLabel={`Delete visit on ${visit.visited_on}`}
                  disabled={submitting || deleting}
                  onPress={() => setDeleteTarget(visit)}
                />
              </View>
            </View>
          ))
        : null}
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
        <ActivityIndicator accessibilityLabel="Loading doctor visits" />
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
