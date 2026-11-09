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
import { ManagerSelectionContext } from '@/components/ui/manager-selection-context';
import { TextInput } from '@/components/ui/text-input';
import { useAuth } from '@/contexts/AuthContext';
import { authenticatedFetch } from '@/lib/api/client';
import type { HealthMemberDto, HealthReadingDto } from '@/lib/api/types';
import {
  formatHeightDisplay,
  formatWeightDisplay,
  type UnitSystem,
} from '@/lib/health/units';
import { useColorPalette } from '@/lib/tenant/TenantThemeContext';

import {
  buildCreateHealthReadingCommand,
  buildUpdateHealthReadingCommand,
  convertFormHeightWeight,
  emptyHealthReadingForm,
  formFromHealthReading,
  NOTES_MAX_LEN,
  parseHealthReadingDto,
  type HealthReadingFormInput,
} from './health-reading-form-utils';

type HealthReadingPanelProps = {
  selectedMember: HealthMemberDto | null;
  unitSystem: UnitSystem;
  onUnitSystemChange: (next: UnitSystem) => void | Promise<void>;
  unitPreferenceReady: boolean;
  /** Notify parent after create / update / delete so charts can reload. */
  onReadingsChanged?: () => void;
};

function todayYmd(): string {
  // Match API validation: recorded_on must not be after Utc::now().date_naive().
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Submit health readings and show history for the selected HealthMember.
 *
 * ```
 * User -> Panel : select member / toggle units / Add reading | Edit | Delete
 * Panel -> ManagerFormVsResults : collapsed until Add or Edit
 * Panel -> Parent : onUnitSystemChange (shared with charts)
 * Panel -> API : GET /health-readings?health_member_id=…
 * alt create (form mode create)
 *   Panel -> Panel : convert imperial → metric if needed
 *   Panel -> API : POST /health-readings (metric fields only)
 * else edit (form mode edit)
 *   Panel -> API : PUT /health-readings/{id} (metric fields only)
 * end
 * alt 2xx
 *   Panel -> API : GET /health-readings (refresh history)
 *   Panel -> Parent : onReadingsChanged (charts refresh)
 *   Panel -> ManagerFormVsResults : collapse; clear vitals (keep date on create)
 * else 4xx
 *   Panel -> User : show API error; keep form open; list unchanged
 * end
 * alt delete
 *   Panel -> ConfirmDialog : show
 *   alt confirm
 *     Panel -> API : DELETE /health-readings/{id}
 *     alt 2xx
 *       Panel -> API : GET refresh; Parent onReadingsChanged
 *     else
 *       Panel -> User : keep row; show error
 *     end
 *   else cancel
 *     Panel -> Panel : keep reading
 *   end
 * end
 * ```
 */
export default function HealthReadingPanel({
  selectedMember,
  unitSystem,
  onUnitSystemChange,
  unitPreferenceReady,
  onReadingsChanged,
}: HealthReadingPanelProps) {
  const { token, handleUnauthorized } = useAuth();
  const palette = useColorPalette();

  const [form, setForm] = useState<HealthReadingFormInput>(() =>
    emptyHealthReadingForm(todayYmd())
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingReadingId, setEditingReadingId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<ManagerFormMode>('collapsed');

  const [readings, setReadings] = useState<HealthReadingDto[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HealthReadingDto | null>(
    null
  );
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);

  const loadGenerationRef = useRef(0);
  const selectedMemberIdRef = useRef<string | null>(null);
  selectedMemberIdRef.current = selectedMember?.id ?? null;
  const prevUnitSystemRef = useRef(unitSystem);
  const prevMemberIdRef = useRef<string | null>(selectedMember?.id ?? null);
  const onReadingsChangedRef = useRef(onReadingsChanged);
  onReadingsChangedRef.current = onReadingsChanged;

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
        unitRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 8,
        },
        unitButton: {
          paddingVertical: 8,
          paddingHorizontal: 12,
          minWidth: 88,
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
        heightRow: {
          flexDirection: 'row',
          gap: 8,
        },
        heightField: {
          flex: 1,
          gap: 4,
        },
        submitRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
        },
        submitButton: {
          flexGrow: 1,
          minWidth: 140,
        },
        historyHeader: {
          marginTop: 8,
          gap: 8,
        },
        historyActionButton: {
          paddingVertical: 6,
          paddingHorizontal: 10,
          minWidth: 72,
        },
      }),
    [palette]
  );

  // Convert height/weight whenever shared unitSystem changes (vitals or charts).
  useEffect(() => {
    const previous = prevUnitSystemRef.current;
    if (previous === unitSystem) {
      return;
    }
    setForm((prev) => convertFormHeightWeight(prev, previous, unitSystem));
    prevUnitSystemRef.current = unitSystem;
  }, [unitSystem]);

  // Clear vitals when leaving a concrete member (A→B or A→null→B).
  // Do not clear on the first select (null→A).
  useEffect(() => {
    const previousId = prevMemberIdRef.current;
    const nextId = selectedMember?.id ?? null;
    if (previousId !== nextId && previousId != null) {
      setForm((prev) => emptyHealthReadingForm(prev.recordedOn));
      setFormError(null);
      setEditingReadingId(null);
      setFormMode('collapsed');
      setActionError(null);
      setDeleteTarget(null);
    }
    prevMemberIdRef.current = nextId;
  }, [selectedMember?.id]);

  const setUnit = useCallback(
    async (next: UnitSystem) => {
      if (next === unitSystem) {
        return;
      }
      await onUnitSystemChange(next);
    },
    [unitSystem, onUnitSystemChange]
  );

  const updateField = useCallback(
    <K extends keyof HealthReadingFormInput>(
      key: K,
      value: HealthReadingFormInput[K]
    ) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const notifyReadingsChanged = useCallback(() => {
    onReadingsChangedRef.current?.();
  }, []);

  const loadReadings = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
    if (!token || !selectedMember) {
      if (generation === loadGenerationRef.current) {
        setReadings([]);
        setListError(null);
        setListLoading(false);
      }
      return;
    }
    setListLoading(true);
    setListError(null);
    try {
      const path = `/health-readings?health_member_id=${encodeURIComponent(selectedMember.id)}`;
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
        ? (raw.map(parseHealthReadingDto) as HealthReadingDto[])
        : [];
      if (generation !== loadGenerationRef.current) {
        return;
      }
      setReadings(list);
    } catch (err: unknown) {
      if (generation !== loadGenerationRef.current) {
        return;
      }
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Failed to load readings';
      setListError(msg);
    } finally {
      if (generation === loadGenerationRef.current) {
        setListLoading(false);
      }
    }
  }, [token, selectedMember, handleUnauthorized]);

  useEffect(() => {
    void loadReadings();
  }, [loadReadings]);

  const isEditing = editingReadingId != null;
  const canSubmit =
    Boolean(token) &&
    Boolean(selectedMember) &&
    unitPreferenceReady &&
    !submitting &&
    !deleting &&
    (isEditing || Boolean(selectedMember?.active));
  const unitToggleLocked = !unitPreferenceReady || submitting || deleting;
  const vitalsLocked =
    unitToggleLocked || (!isEditing && !selectedMember?.active);

  const collapseForm = useCallback(() => {
    setEditingReadingId(null);
    setForm(emptyHealthReadingForm(todayYmd()));
    setFormError(null);
    setFormMode('collapsed');
  }, []);

  const handleFormModeChange = useCallback((next: ManagerFormMode) => {
    if (next === 'create') {
      setEditingReadingId(null);
      setForm(emptyHealthReadingForm(todayYmd()));
      setFormError(null);
      setActionError(null);
    } else if (next === 'collapsed') {
      setEditingReadingId(null);
      setForm(emptyHealthReadingForm(todayYmd()));
      setFormError(null);
    }
    setFormMode(next);
  }, []);

  const startEdit = (reading: HealthReadingDto) => {
    setEditingReadingId(reading.id);
    setForm(formFromHealthReading(reading, unitSystem));
    setFormError(null);
    setActionError(null);
    setFormMode('edit');
  };

  const handleSubmit = async () => {
    setFormError(null);
    setActionError(null);
    if (!token) {
      setFormError('No authentication token available.');
      return;
    }
    if (!selectedMember) {
      setFormError('Select a HealthMember before saving a reading.');
      return;
    }
    if (!isEditing && !selectedMember.active) {
      setFormError('Selected HealthMember is inactive. Choose an active member.');
      return;
    }

    const memberIdAtSubmit = selectedMember.id;
    const editingId = editingReadingId;

    let requestPath: string;
    let method: 'POST' | 'PUT';
    let body: string;
    if (editingId != null) {
      const built = buildUpdateHealthReadingCommand(unitSystem, form);
      if (!built.ok) {
        setFormError(built.error);
        return;
      }
      requestPath = `/health-readings/${encodeURIComponent(editingId)}`;
      method = 'PUT';
      body = JSON.stringify(built.command);
    } else {
      const built = buildCreateHealthReadingCommand(
        selectedMember.id,
        unitSystem,
        form
      );
      if (!built.ok) {
        setFormError(built.error);
        return;
      }
      requestPath = '/health-readings';
      method = 'POST';
      body = JSON.stringify(built.command);
    }

    setSubmitting(true);
    const previousList = readings;
    try {
      const response = await authenticatedFetch(requestPath, {
        method,
        token,
        headers: { 'Content-Type': 'application/json' },
        body,
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
      // Skip clear/refresh when the selected member changed during the save.
      if (selectedMemberIdRef.current === memberIdAtSubmit) {
        if (editingId != null) {
          collapseForm();
        } else {
          setForm((prev) => ({
            ...emptyHealthReadingForm(prev.recordedOn),
          }));
          setFormMode('collapsed');
        }
        await loadReadings();
        notifyReadingsChanged();
      }
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Failed to save reading';
      setFormError(msg);
      if (selectedMemberIdRef.current === memberIdAtSubmit) {
        setReadings(previousList);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!token || !deleteTarget || deletingRef.current) {
      if (!token) {
        setActionError('No authentication token available.');
      }
      return;
    }
    const target = deleteTarget;
    const memberIdAtDelete = selectedMemberIdRef.current;
    deletingRef.current = true;
    setDeleting(true);
    setActionError(null);
    setDeleteTarget(null);
    const previousList = readings;
    // Optimistic remove so a second confirm cannot revive the row after 404.
    setReadings((prev) => prev.filter((r) => r.id !== target.id));
    if (editingReadingId === target.id) {
      collapseForm();
    }
    try {
      const response = await authenticatedFetch(
        `/health-readings/${encodeURIComponent(target.id)}`,
        {
          method: 'DELETE',
          token,
          onUnauthorized: handleUnauthorized,
        }
      );
      // 404: already gone — keep optimistic removal.
      if (!response.ok && response.status !== 404) {
        const bodyText = await response.text();
        throw new Error(
          bodyText
            ? `Request failed (${response.status}): ${bodyText}`
            : `Request failed with status ${response.status}`
        );
      }
      if (selectedMemberIdRef.current === memberIdAtDelete) {
        await loadReadings();
        notifyReadingsChanged();
      }
    } catch (err: unknown) {
      console.error(err);
      const msg =
        err instanceof Error ? err.message : 'Failed to delete reading';
      setActionError(msg);
      if (selectedMemberIdRef.current === memberIdAtDelete) {
        setReadings(previousList);
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
          Sign in to submit and view health readings.
        </ThemedText>
      </View>
    );
  }

  const addDisabled =
    !selectedMember?.active || !unitPreferenceReady || submitting || deleting;

  const emptyMessage = !selectedMember
    ? ''
    : !selectedMember.active
      ? 'Selected HealthMember is inactive. Choose an active member to add readings.'
      : listError
        ? 'Readings could not be loaded.'
        : 'No readings yet.';

  const formHint = !selectedMember
    ? null
    : isEditing
      ? `Editing reading for ${selectedMember.display_name}. API stores metric values only.`
      : `Recording for ${selectedMember.display_name}. API stores metric values only.`;

  const readingForm = (
    <View style={styles.container} accessibilityLabel="Health reading form">
      {formHint ? <ThemedText style={styles.hint}>{formHint}</ThemedText> : null}

      <View style={styles.fieldBlock}>
        <FieldLabel label="Recorded date" required />
        <DatePicker
          value={form.recordedOn}
          onChange={(value) => updateField('recordedOn', value)}
          accessibilityLabel="Recorded date"
          disabled={vitalsLocked}
        />
      </View>

      {unitSystem === 'metric' ? (
        <>
          <View style={styles.fieldBlock}>
            <FieldLabel label="Height (cm)" />
            <TextInput
              editable={!vitalsLocked}
              style={styles.input}
              value={form.heightCm}
              onChangeText={(v) => updateField('heightCm', v)}
              keyboardType="decimal-pad"
              accessibilityLabel="Height in centimetres"
              placeholder="e.g. 180"
              placeholderTextColor={palette.icon}
            />
          </View>
          <View style={styles.fieldBlock}>
            <FieldLabel label="Weight (kg)" />
            <TextInput
              editable={!vitalsLocked}
              style={styles.input}
              value={form.weightKg}
              onChangeText={(v) => updateField('weightKg', v)}
              keyboardType="decimal-pad"
              accessibilityLabel="Weight in kilograms"
              placeholder="e.g. 70"
              placeholderTextColor={palette.icon}
            />
          </View>
        </>
      ) : (
        <>
          <View style={styles.heightRow}>
            <View style={styles.heightField}>
              <FieldLabel label="Height (ft)" />
              <TextInput
                editable={!vitalsLocked}
                style={styles.input}
                value={form.heightFeet}
                onChangeText={(v) => updateField('heightFeet', v)}
                keyboardType="number-pad"
                accessibilityLabel="Height feet"
                placeholder="e.g. 5"
                placeholderTextColor={palette.icon}
              />
            </View>
            <View style={styles.heightField}>
              <FieldLabel label="Height (in)" />
              <TextInput
                editable={!vitalsLocked}
                style={styles.input}
                value={form.heightInches}
                onChangeText={(v) => updateField('heightInches', v)}
                keyboardType="decimal-pad"
                accessibilityLabel="Height inches"
                placeholder="e.g. 10.9"
                placeholderTextColor={palette.icon}
              />
            </View>
          </View>
          <View style={styles.fieldBlock}>
            <FieldLabel label="Weight (lb)" />
            <TextInput
              editable={!vitalsLocked}
              style={styles.input}
              value={form.weightLb}
              onChangeText={(v) => updateField('weightLb', v)}
              keyboardType="decimal-pad"
              accessibilityLabel="Weight in pounds"
              placeholder="e.g. 154.3"
              placeholderTextColor={palette.icon}
            />
          </View>
        </>
      )}

      <View style={styles.fieldBlock}>
        <FieldLabel label="Systolic (mmHg)" />
        <TextInput
          editable={!vitalsLocked}
          style={styles.input}
          value={form.systolic}
          onChangeText={(v) => updateField('systolic', v)}
          keyboardType="number-pad"
          accessibilityLabel="Systolic blood pressure"
          placeholder="e.g. 120"
          placeholderTextColor={palette.icon}
        />
      </View>
      <View style={styles.fieldBlock}>
        <FieldLabel label="Diastolic (mmHg)" />
        <TextInput
          editable={!vitalsLocked}
          style={styles.input}
          value={form.diastolic}
          onChangeText={(v) => updateField('diastolic', v)}
          keyboardType="number-pad"
          accessibilityLabel="Diastolic blood pressure"
          placeholder="e.g. 80"
          placeholderTextColor={palette.icon}
        />
      </View>
      <View style={styles.fieldBlock}>
        <FieldLabel label="Heart rate (bpm)" />
        <TextInput
          editable={!vitalsLocked}
          style={styles.input}
          value={form.heartRate}
          onChangeText={(v) => updateField('heartRate', v)}
          keyboardType="number-pad"
          accessibilityLabel="Heart rate"
          placeholder="e.g. 72"
          placeholderTextColor={palette.icon}
        />
      </View>
      <View style={styles.fieldBlock}>
        <FieldLabel label="Notes" />
        <TextInput
          editable={!vitalsLocked}
          style={[styles.input, styles.inputMultiline]}
          value={form.notes}
          onChangeText={(v) => updateField('notes', v)}
          multiline
          accessibilityLabel="Reading notes"
          placeholder={`Optional (max ${NOTES_MAX_LEN})`}
          placeholderTextColor={palette.icon}
        />
      </View>

      {formError ? (
        <Text style={styles.errorText} accessibilityRole="alert">
          {formError}
        </Text>
      ) : null}

      <View style={styles.submitRow}>
        <ManagerCta
          label={isEditing ? 'Update reading' : 'Save reading'}
          accessibilityLabel={
            isEditing ? 'Update health reading' : 'Save health reading'
          }
          disabled={!canSubmit}
          loading={submitting}
          onPress={() => {
            void handleSubmit();
          }}
          style={styles.submitButton}
        />
      </View>
    </View>
  );

  const historyResults = (
    <View style={styles.historyHeader} accessibilityLabel="Reading history">
      <ThemedText type="sectionTitle">History</ThemedText>
      {actionError ? (
        <Text style={styles.errorText} accessibilityRole="alert">
          {actionError}
        </Text>
      ) : null}
      {listLoading ? (
        <ActivityIndicator
          color={palette.tint}
          accessibilityLabel="Loading readings"
        />
      ) : null}
      {!listLoading ? (
        <ManagerDataList
          testID="health-reading-data-list"
          leadingHeader="Date"
          columnHeaders={[
            { key: 'vitals', label: 'Vitals', primary: true },
            { key: 'notes', label: 'Notes' },
          ]}
        >
          {readings.map((reading) => {
            const weight = formatWeightDisplay(reading.weight_kg, unitSystem);
            const height = formatHeightDisplay(reading.height_cm, unitSystem);
            const bp =
              reading.systolic_mm_hg != null && reading.diastolic_mm_hg != null
                ? `${reading.systolic_mm_hg}/${reading.diastolic_mm_hg} mmHg`
                : null;
            const hr =
              reading.heart_rate_bpm != null
                ? `${reading.heart_rate_bpm} bpm`
                : null;
            const bmi =
              reading.bmi != null && Number.isFinite(reading.bmi)
                ? `BMI ${reading.bmi}`
                : null;
            const lines = [height, weight, bp, hr, bmi].filter(Boolean) as string[];
            const vitals = lines.length > 0 ? lines.join(' · ') : MANAGER_DATA_EMPTY_CELL;
            const notes = reading.notes?.trim()
              ? reading.notes
              : MANAGER_DATA_EMPTY_CELL;
            return (
              <ManagerDataListRow
                key={reading.id}
                testID={`health-reading-row-${reading.id}`}
                accessibilityLabel={`Reading on ${reading.recorded_on}`}
                leading={reading.recorded_on}
                cells={[
                  {
                    key: 'vitals',
                    content: vitals,
                    primary: true,
                    accessibilityLabel:
                      lines.length > 0 ? vitals : 'Vitals: none',
                  },
                  {
                    key: 'notes',
                    content: notes,
                    accessibilityLabel:
                      reading.notes?.trim()
                        ? reading.notes
                        : 'Notes: none',
                  },
                ]}
                actions={
                  <>
                    <Button
                      variant="secondary"
                      label="Edit"
                      accessibilityLabel={`Edit reading on ${reading.recorded_on}`}
                      disabled={submitting || deleting}
                      onPress={() => startEdit(reading)}
                      style={styles.historyActionButton}
                    />
                    <Button
                      variant="destructive"
                      label="Delete"
                      accessibilityLabel={`Delete reading on ${reading.recorded_on}`}
                      disabled={submitting || deleting}
                      onPress={() => {
                        setActionError(null);
                        setDeleteTarget(reading);
                      }}
                      style={styles.historyActionButton}
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
    <View style={styles.container} accessibilityLabel="Health readings panel">
      <ManagerSelectionContext
        entityNoun="HealthMember"
        selectedLabel={selectedMember?.display_name ?? null}
        inactive={selectedMember ? !selectedMember.active : false}
        emptyHint="Choose a HealthMember above to enter vitals."
      />

      <View style={styles.unitRow}>
        <ThemedText>Units</ThemedText>
        <Button
          variant={unitSystem === 'metric' ? 'primary' : 'outline'}
          label="Metric"
          accessibilityLabel="Use metric units"
          disabled={unitToggleLocked}
          onPress={() => {
            void setUnit('metric');
          }}
          style={styles.unitButton}
        />
        <Button
          variant={unitSystem === 'imperial' ? 'primary' : 'outline'}
          label="Imperial"
          accessibilityLabel="Use imperial units"
          disabled={unitToggleLocked}
          onPress={() => {
            void setUnit('imperial');
          }}
          style={styles.unitButton}
        />
      </View>

      {listError ? (
        <Text style={styles.errorText} accessibilityRole="alert">
          {listError}
        </Text>
      ) : null}

      {selectedMember &&
      listLoading &&
      readings.length === 0 &&
      formMode === 'collapsed' ? (
        <ActivityIndicator
          color={palette.tint}
          accessibilityLabel="Loading readings"
        />
      ) : (
        <ManagerFormVsResults
          itemCount={readings.length}
          addLabel="Add reading"
          emptyMessage={emptyMessage}
          addDisabled={addDisabled}
          addAccessibilityLabel="Add reading"
          mode={formMode}
          onModeChange={handleFormModeChange}
          onCancel={() => {
            if (submitting || deleting) {
              return false;
            }
          }}
          form={readingForm}
          results={historyResults}
          testID="health-readings-form-vs-results"
        />
      )}

      <ConfirmDialog
        visible={deleteTarget != null}
        title="Delete reading?"
        message={
          deleteTarget
            ? `Delete the reading from ${deleteTarget.recorded_on}? This cannot be undone.`
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
