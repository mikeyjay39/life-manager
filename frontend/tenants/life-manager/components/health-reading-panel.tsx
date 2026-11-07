import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { FieldLabel } from '@/components/ui/field-label';
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
  convertFormHeightWeight,
  NOTES_MAX_LEN,
  parseHealthReadingDto,
  type HealthReadingFormInput,
} from './health-reading-form-utils';

type HealthReadingPanelProps = {
  selectedMember: HealthMemberDto | null;
  unitSystem: UnitSystem;
  onUnitSystemChange: (next: UnitSystem) => void | Promise<void>;
  unitPreferenceReady: boolean;
};

function emptyForm(recordedOn = ''): HealthReadingFormInput {
  return {
    recordedOn,
    heightCm: '',
    weightKg: '',
    heightFeet: '',
    heightInches: '',
    weightLb: '',
    systolic: '',
    diastolic: '',
    heartRate: '',
    notes: '',
  };
}

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
 * User -> Panel : select member (parent) / toggle units / fill form / submit
 * Panel -> Parent : onUnitSystemChange (shared with charts)
 * Panel -> API : GET /health-readings?health_member_id=…
 * alt submit valid
 *   Panel -> Panel : convert imperial → metric if needed
 *   Panel -> API : POST /health-readings (metric fields only)
 *   alt 2xx
 *     Panel -> API : GET /health-readings (refresh history)
 *     Panel -> Panel : clear vitals; keep date
 *   else 4xx
 *     Panel -> User : show API error; list unchanged
 *   end
 * else client validation fail
 *   Panel -> User : show validation; no POST
 * end
 * ```
 */
export default function HealthReadingPanel({
  selectedMember,
  unitSystem,
  onUnitSystemChange,
  unitPreferenceReady,
}: HealthReadingPanelProps) {
  const { token, handleUnauthorized } = useAuth();
  const palette = useColorPalette();

  const [form, setForm] = useState<HealthReadingFormInput>(() =>
    emptyForm(todayYmd())
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [readings, setReadings] = useState<HealthReadingDto[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const loadGenerationRef = useRef(0);
  const selectedMemberIdRef = useRef<string | null>(null);
  selectedMemberIdRef.current = selectedMember?.id ?? null;

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
        historyHeader: {
          marginTop: 8,
          gap: 4,
        },
        historyItem: {
          borderWidth: 1,
          borderColor: palette.icon,
          borderRadius: 8,
          padding: 10,
          gap: 4,
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
      }),
    [palette]
  );

  const setUnit = useCallback(
    async (next: UnitSystem) => {
      if (next === unitSystem) {
        return;
      }
      setForm((prev) => convertFormHeightWeight(prev, unitSystem, next));
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

  const canSubmit =
    Boolean(token) &&
    Boolean(selectedMember?.active) &&
    unitPreferenceReady &&
    !submitting;
  const fieldsLocked = !unitPreferenceReady || submitting;

  const handleSubmit = async () => {
    setFormError(null);
    if (!token) {
      setFormError('No authentication token available.');
      return;
    }
    if (!selectedMember) {
      setFormError('Select a HealthMember before saving a reading.');
      return;
    }
    if (!selectedMember.active) {
      setFormError('Selected HealthMember is inactive. Choose an active member.');
      return;
    }

    const built = buildCreateHealthReadingCommand(
      selectedMember.id,
      unitSystem,
      form
    );
    if (!built.ok) {
      setFormError(built.error);
      return;
    }

    const memberIdAtSubmit = selectedMember.id;
    setSubmitting(true);
    const previousList = readings;
    try {
      const response = await authenticatedFetch('/health-readings', {
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
      // Skip clear/refresh when the selected member changed during the POST.
      if (selectedMemberIdRef.current === memberIdAtSubmit) {
        setForm((prev) => ({
          ...emptyForm(prev.recordedOn),
        }));
        await loadReadings();
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

  if (!token) {
    return (
      <View style={styles.container}>
        <ThemedText style={styles.hint}>
          Sign in to submit and view health readings.
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.container} accessibilityLabel="Health readings panel">
      <View style={styles.unitRow}>
        <ThemedText>Units</ThemedText>
        <Button
          variant={unitSystem === 'metric' ? 'primary' : 'outline'}
          label="Metric"
          accessibilityLabel="Use metric units"
          disabled={fieldsLocked}
          onPress={() => {
            void setUnit('metric');
          }}
          style={styles.unitButton}
        />
        <Button
          variant={unitSystem === 'imperial' ? 'primary' : 'outline'}
          label="Imperial"
          accessibilityLabel="Use imperial units"
          disabled={fieldsLocked}
          onPress={() => {
            void setUnit('imperial');
          }}
          style={styles.unitButton}
        />
      </View>

      {!selectedMember ? (
        <ThemedText style={styles.hint}>
          Select or create a HealthMember to enter vitals.
        </ThemedText>
      ) : !selectedMember.active ? (
        <ThemedText style={styles.hint}>
          Selected HealthMember is inactive. Choose an active member to add
          readings.
        </ThemedText>
      ) : (
        <ThemedText style={styles.hint}>
          Recording for {selectedMember.display_name}. API stores metric values
          only.
        </ThemedText>
      )}

      <View style={styles.fieldBlock}>
        <FieldLabel label="Recorded date" required />
        <DatePicker
          value={form.recordedOn}
          onChange={(value) => updateField('recordedOn', value)}
          accessibilityLabel="Recorded date"
          disabled={fieldsLocked}
        />
      </View>

      {unitSystem === 'metric' ? (
        <>
          <View style={styles.fieldBlock}>
            <FieldLabel label="Height (cm)" />
            <TextInput
              editable={!fieldsLocked}
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
              editable={!fieldsLocked}
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
              editable={!fieldsLocked}
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
              editable={!fieldsLocked}
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
              editable={!fieldsLocked}
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
              editable={!fieldsLocked}
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
              editable={!fieldsLocked}
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
              editable={!fieldsLocked}
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
              editable={!fieldsLocked}
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

      <Button
        label="Save reading"
        accessibilityLabel="Save health reading"
        disabled={!canSubmit}
        loading={submitting}
        onPress={() => {
          void handleSubmit();
        }}
      />

      <View style={styles.historyHeader} accessibilityLabel="Reading history">
        <ThemedText type="defaultSemiBold">History</ThemedText>
        {!selectedMember ? (
          <ThemedText style={styles.hint}>
            History appears after you select a HealthMember.
          </ThemedText>
        ) : listLoading ? (
          <ActivityIndicator
            color={palette.tint}
            accessibilityLabel="Loading readings"
          />
        ) : listError ? (
          <Text style={styles.errorText} accessibilityRole="alert">
            {listError}
          </Text>
        ) : readings.length === 0 ? (
          <ThemedText style={styles.hint}>No readings yet.</ThemedText>
        ) : (
          readings.map((reading) => {
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
            const lines = [height, weight, bp, hr, bmi].filter(Boolean);
            return (
              <View
                key={reading.id}
                style={styles.historyItem}
                accessibilityLabel={`Reading on ${reading.recorded_on}`}>
                <Text style={styles.historyDate}>{reading.recorded_on}</Text>
                {lines.length > 0 ? (
                  <Text style={styles.historyLine}>{lines.join(' · ')}</Text>
                ) : null}
                {reading.notes ? (
                  <Text style={styles.historyMuted}>{reading.notes}</Text>
                ) : null}
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}
