import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LineChart } from 'react-native-gifted-charts';

import { Button } from '@/components/ui/button';
import { ManagerSelectionContext } from '@/components/ui/manager-selection-context';
import { useAuth } from '@/contexts/AuthContext';
import { authenticatedFetch } from '@/lib/api/client';
import type { HealthMemberDto } from '@/lib/api/types';
import type { HealthReadingDto } from '@/lib/api/generated/life-manager/HealthReadingDto';
import {
  buildChartSeries,
  defaultChartFromDate,
  localTodayIsoDate,
  shortDateLabel,
  type ChartMetric,
  type HealthChartSeries,
} from '@/lib/health/chart-series';
import { type UnitSystem } from '@/lib/health/units';
import { useColorPalette } from '@/lib/tenant/TenantThemeContext';

type HealthChartsPanelProps = {
  healthMember: HealthMemberDto | null;
  unitSystem: UnitSystem;
  onUnitSystemChange: (next: UnitSystem) => void | Promise<void>;
  unitPreferenceReady: boolean;
  /** Bump after vitals create / update / delete so charts reload. */
  refreshKey?: number;
};

const METRICS: { id: ChartMetric; label: string }[] = [
  { id: 'weight', label: 'Weight' },
  { id: 'height', label: 'Height' },
  { id: 'blood_pressure', label: 'Blood pressure' },
  { id: 'heart_rate', label: 'Heart rate' },
  { id: 'bmi', label: 'BMI' },
];

function parseHealthReadingDto(item: unknown): HealthReadingDto {
  const row = item as HealthReadingDto;
  return {
    id: String(row.id),
    health_member_id: String(row.health_member_id),
    recorded_on: String(row.recorded_on),
    height_cm: row.height_cm ?? null,
    weight_kg: row.weight_kg ?? null,
    systolic_mm_hg: row.systolic_mm_hg ?? null,
    diastolic_mm_hg: row.diastolic_mm_hg ?? null,
    heart_rate_bpm: row.heart_rate_bpm ?? null,
    notes: row.notes ?? null,
    bmi: row.bmi ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function metricAccessibilityLabel(metric: ChartMetric): string {
  switch (metric) {
    case 'weight':
      return 'Weight chart';
    case 'height':
      return 'Height chart';
    case 'blood_pressure':
      return 'Blood pressure chart';
    case 'heart_rate':
      return 'Heart rate chart';
    case 'bmi':
      return 'BMI chart';
  }
}

/**
 * Charts for vitals over time for the selected HealthMember.
 *
 * ```
 * sequenceDiagram
 *   User -> Charts : select metric / toggle units
 *   Charts -> Pref : load/save health_unit_preference
 *   Charts -> API : GET /health-readings?health_member_id&from
 *   API -> Charts : metric HealthReadingDto[]
 *   Charts -> Series : sort, filter nulls, convert for display
 *   Charts -> LineChart : render points (gifted-charts)
 * ```
 */
export default function HealthChartsPanel({
  healthMember,
  unitSystem,
  onUnitSystemChange,
  unitPreferenceReady,
  refreshKey = 0,
}: HealthChartsPanelProps) {
  const { token, handleUnauthorized } = useAuth();
  const palette = useColorPalette();
  const { width: windowWidth } = useWindowDimensions();

  const [metric, setMetric] = useState<ChartMetric>('weight');
  const [readings, setReadings] = useState<HealthReadingDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadGenerationRef = useRef(0);

  const loadReadings = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
    if (!token || !healthMember) {
      if (generation === loadGenerationRef.current) {
        setReadings([]);
        setError(null);
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    setError(null);
    const from = defaultChartFromDate();
    const to = localTodayIsoDate();
    const query = new URLSearchParams({
      health_member_id: healthMember.id,
      from,
      to,
    });

    try {
      const response = await authenticatedFetch(
        `/health-readings?${query.toString()}`,
        {
          token,
          onUnauthorized: handleUnauthorized,
        }
      );
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Failed to load readings (${response.status})`);
      }
      const raw: unknown = await response.json();
      const list = Array.isArray(raw) ? raw.map(parseHealthReadingDto) : [];
      if (generation !== loadGenerationRef.current) {
        return;
      }
      setReadings(list);
    } catch (err) {
      if (generation !== loadGenerationRef.current) {
        return;
      }
      const msg =
        err instanceof Error ? err.message : 'Failed to load health readings';
      setError(msg);
      setReadings([]);
    } finally {
      if (generation === loadGenerationRef.current) {
        setLoading(false);
      }
    }
  }, [token, healthMember, handleUnauthorized]);

  useEffect(() => {
    void loadReadings();
  }, [loadReadings, refreshKey]);

  const series: HealthChartSeries = useMemo(
    () => buildChartSeries(readings, metric, unitSystem),
    [readings, metric, unitSystem]
  );

  const setUnitAndPersist = async (next: UnitSystem) => {
    if (next === unitSystem) {
      return;
    }
    await onUnitSystemChange(next);
  };

  const chartWidth = Math.max(280, Math.min(windowWidth - 48, 720));
  const pointCount =
    series.kind === 'blood_pressure'
      ? series.points.length
      : series.points.length;

  const lineData = useMemo(() => {
    if (series.kind === 'blood_pressure') {
      return series.points.map((p) => ({
        value: p.systolic,
        label: shortDateLabel(p.recordedOn),
        dataPointText: String(p.systolic),
      }));
    }
    return series.points.map((p) => ({
      value: p.value,
      label: shortDateLabel(p.recordedOn),
      dataPointText: String(p.value),
    }));
  }, [series]);

  const lineData2 = useMemo(() => {
    if (series.kind !== 'blood_pressure') return undefined;
    return series.points.map((p) => ({
      value: p.diastolic,
      label: shortDateLabel(p.recordedOn),
      dataPointText: String(p.diastolic),
    }));
  }, [series]);

  if (!token) {
    return (
      <Text style={{ color: palette.text }}>
        Sign in to view health charts.
      </Text>
    );
  }

  if (!healthMember) {
    return (
      <ManagerSelectionContext
        entityNoun="HealthMember"
        selectedLabel={null}
        emptyHint="Choose a HealthMember above to view charts."
      />
    );
  }

  return (
    <View style={styles.root} accessibilityLabel="Health charts panel">
      <ManagerSelectionContext
        entityNoun="HealthMember"
        selectedLabel={healthMember.display_name}
        inactive={!healthMember.active}
      />
      <Text style={[styles.memberHint, { color: palette.icon }]}>
        Charts for {healthMember.display_name} (last 12 months)
      </Text>

      <View
        style={styles.unitRow}
        accessibilityRole="radiogroup"
        accessibilityLabel="Unit system">
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{
            checked: unitSystem === 'metric',
            disabled: !unitPreferenceReady,
          }}
          accessibilityLabel="Metric units"
          disabled={!unitPreferenceReady}
          onPress={() => void setUnitAndPersist('metric')}
          style={[
            styles.unitChip,
            {
              borderColor: palette.tint,
              backgroundColor:
                unitSystem === 'metric' ? palette.tint : 'transparent',
            },
          ]}>
          <Text
            style={{
              color: unitSystem === 'metric' ? palette.onTint : palette.text,
            }}>
            Metric
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{
            checked: unitSystem === 'imperial',
            disabled: !unitPreferenceReady,
          }}
          accessibilityLabel="Imperial units"
          disabled={!unitPreferenceReady}
          onPress={() => void setUnitAndPersist('imperial')}
          style={[
            styles.unitChip,
            {
              borderColor: palette.tint,
              backgroundColor:
                unitSystem === 'imperial' ? palette.tint : 'transparent',
            },
          ]}>
          <Text
            style={{
              color: unitSystem === 'imperial' ? palette.onTint : palette.text,
            }}>
            Imperial
          </Text>
        </Pressable>
      </View>

      <View style={styles.metricRow} accessibilityLabel="Chart metric picker">
        {METRICS.map((item) => {
          const selected = metric === item.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Show ${item.label} chart`}
              onPress={() => setMetric(item.id)}
              style={[
                styles.metricChip,
                {
                  borderColor: palette.icon,
                  backgroundColor: selected
                    ? palette.tint
                    : 'transparent',
                },
              ]}>
              <Text
                style={{
                  color: selected ? palette.onTint : palette.text,
                  fontSize: 13,
                }}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {error ? (
        <View style={styles.errorBlock}>
          <Text style={{ color: '#ff3b30' }}>{error}</Text>
          <Button
            variant="outline"
            label="Retry"
            accessibilityLabel="Retry load charts"
            onPress={() => void loadReadings()}
          />
        </View>
      ) : null}

      {loading || !unitPreferenceReady ? (
        <ActivityIndicator
          color={palette.tint}
          accessibilityLabel="Loading health charts"
        />
      ) : pointCount === 0 ? (
        <Text
          style={{ color: palette.icon }}
          accessibilityLabel="Charts empty state">
          No readings in this range for the selected metric.
        </Text>
      ) : (
        <View
          accessibilityLabel={metricAccessibilityLabel(metric)}
          style={styles.chartWrap}>
          <Text
            style={[styles.axisLabel, { color: palette.text }]}
            accessibilityLabel={`Y axis ${series.yAxisLabel}`}>
            {series.yAxisLabel}
          </Text>
          {series.kind === 'blood_pressure' ? (
            <View
              style={styles.legend}
              accessibilityLabel="Blood pressure legend">
              <Text style={{ color: palette.tint }}>● Systolic</Text>
              <Text style={{ color: palette.icon }}>● Diastolic</Text>
            </View>
          ) : null}
          <LineChart
            data={lineData}
            data2={lineData2}
            width={chartWidth}
            height={220}
            spacing={Math.max(36, Math.floor(chartWidth / (pointCount + 1)))}
            initialSpacing={16}
            color={palette.tint}
            color2={palette.icon}
            thickness={2}
            thickness2={2}
            dataPointsColor={palette.tint}
            dataPointsColor2={palette.icon}
            hideDataPoints={false}
            yAxisColor={palette.icon}
            xAxisColor={palette.icon}
            yAxisTextStyle={{ color: palette.icon, fontSize: 11 }}
            xAxisLabelTextStyle={{ color: palette.icon, fontSize: 10 }}
            rulesColor={palette.icon}
            rulesType="solid"
            noOfSections={4}
            isAnimated={false}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 12,
  },
  memberHint: {
    fontSize: 13,
  },
  unitRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  unitChip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  metricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricChip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  errorBlock: {
    gap: 8,
  },
  chartWrap: {
    gap: 8,
    minHeight: 240,
  },
  axisLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  legend: {
    flexDirection: 'row',
    gap: 16,
  },
});
