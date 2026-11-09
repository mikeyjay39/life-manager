import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { BarChart, LineChart } from 'react-native-gifted-charts';

import { Button } from '@/components/ui/button';
import { ManagerSelectionContext } from '@/components/ui/manager-selection-context';
import { useAuth } from '@/contexts/AuthContext';
import { authenticatedFetch } from '@/lib/api/client';
import type { CarDto } from '@/lib/api/types';
import type { CarMaintenanceEventDto } from '@/lib/api/generated/life-manager/CarMaintenanceEventDto';
import {
  buildCarChartSeries,
  defaultChartFromDate,
  localTodayIsoDate,
  milesSinceLastOilChange,
  seriesPointCount,
  shortDateLabel,
  type CarChartMetric,
  type CarChartSeries,
} from '@/lib/car/chart-series';
import { useColorPalette } from '@/lib/tenant/TenantThemeContext';

import { carDisplayLabel } from './car-panel';
import { parseCarMaintenanceEventDto } from './car-maintenance-form-utils';

type CarChartsPanelProps = {
  selectedCar: CarDto | null;
  /** Bump after maintenance create / update / delete so charts reload. */
  refreshKey?: number;
};

const METRICS: { id: CarChartMetric; label: string }[] = [
  { id: 'odometer', label: 'Odometer' },
  { id: 'event_type', label: 'Event types' },
  { id: 'cost', label: 'Cost' },
];

function metricAccessibilityLabel(metric: CarChartMetric): string {
  switch (metric) {
    case 'odometer':
      return 'Odometer chart';
    case 'event_type':
      return 'Event type chart';
    case 'cost':
      return 'Cost chart';
  }
}

/**
 * Charts for maintenance data for the selected Car.
 *
 * ```
 * sequenceDiagram
 *   User -> Charts : select metric
 *   Charts -> API : GET /car-maintenance-events?car_id&from&to
 *   API -> Charts : CarMaintenanceEventDto[]
 *   Charts -> Series : sort, filter nulls, map miles or USD or counts
 *   alt odometer or cost
 *     Charts -> LineChart : render points (gifted-charts)
 *   else event_type
 *     Charts -> BarChart : render counts (gifted-charts)
 *   end
 * ```
 */
export default function CarChartsPanel({
  selectedCar,
  refreshKey = 0,
}: CarChartsPanelProps) {
  const { token, handleUnauthorized } = useAuth();
  const palette = useColorPalette();
  const { width: windowWidth } = useWindowDimensions();

  const [metric, setMetric] = useState<CarChartMetric>('odometer');
  const [events, setEvents] = useState<CarMaintenanceEventDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadGenerationRef = useRef(0);

  const loadEvents = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
    if (!token || !selectedCar) {
      if (generation === loadGenerationRef.current) {
        setEvents([]);
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
      car_id: selectedCar.id,
      from,
      to,
    });

    try {
      const response = await authenticatedFetch(
        `/car-maintenance-events?${query.toString()}`,
        {
          token,
          onUnauthorized: handleUnauthorized,
        }
      );
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Failed to load events (${response.status})`);
      }
      const raw: unknown = await response.json();
      const list = Array.isArray(raw)
        ? raw.map(parseCarMaintenanceEventDto)
        : [];
      if (generation !== loadGenerationRef.current) {
        return;
      }
      setEvents(list);
    } catch (err) {
      if (generation !== loadGenerationRef.current) {
        return;
      }
      const msg =
        err instanceof Error ? err.message : 'Failed to load maintenance events';
      setError(msg);
      setEvents([]);
    } finally {
      if (generation === loadGenerationRef.current) {
        setLoading(false);
      }
    }
  }, [token, selectedCar, handleUnauthorized]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents, refreshKey]);

  const series: CarChartSeries = useMemo(
    () => buildCarChartSeries(events, metric),
    [events, metric]
  );

  const oilMiles = useMemo(
    () => (loading ? null : milesSinceLastOilChange(events)),
    [events, loading]
  );

  const chartWidth = Math.max(280, Math.min(windowWidth - 48, 720));
  const pointCount = seriesPointCount(series);

  const lineData = useMemo(() => {
    if (series.kind === 'event_type') {
      return [];
    }
    return series.points.map((p) => ({
      value: p.value,
      label: shortDateLabel(p.occurredOn),
      dataPointText: String(p.value),
    }));
  }, [series]);

  const barData = useMemo(() => {
    if (series.kind !== 'event_type') {
      return [];
    }
    return series.counts.map((c) => ({
      value: c.count,
      label: c.label,
      frontColor: palette.tint,
    }));
  }, [series, palette.tint]);

  if (!token) {
    return (
      <Text style={{ color: palette.text }}>
        Sign in to view car charts.
      </Text>
    );
  }

  if (!selectedCar) {
    return (
      <ManagerSelectionContext
        entityNoun="Car"
        selectedLabel={null}
        emptyHint="Choose a Car above to view charts."
      />
    );
  }

  return (
    <View style={styles.root} accessibilityLabel="Car charts panel">
      <ManagerSelectionContext
        entityNoun="Car"
        selectedLabel={carDisplayLabel(selectedCar)}
        inactive={!selectedCar.active}
      />
      <Text style={[styles.memberHint, { color: palette.icon }]}>
        Charts for {carDisplayLabel(selectedCar)} (last 12 months)
      </Text>

      {oilMiles != null ? (
        <Text
          style={{ color: palette.text, fontSize: 13 }}
          accessibilityLabel="Miles since last oil change">
          Miles since last oil change: {oilMiles}
        </Text>
      ) : null}

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
                  backgroundColor: selected ? palette.tint : 'transparent',
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
            onPress={() => void loadEvents()}
          />
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator
          color={palette.tint}
          accessibilityLabel="Loading car charts"
        />
      ) : error ? null : pointCount === 0 ? (
        <Text
          style={{ color: palette.icon }}
          accessibilityLabel="Charts empty state">
          {metric === 'odometer'
            ? 'No odometer readings in this range.'
            : metric === 'cost'
              ? 'No cost values in this range.'
              : 'No maintenance events in this range.'}
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
          {series.kind === 'event_type' ? (
            <BarChart
              data={barData}
              width={chartWidth}
              height={220}
              barWidth={28}
              spacing={Math.max(
                24,
                Math.floor(chartWidth / (pointCount + 1)) - 28
              )}
              initialSpacing={16}
              frontColor={palette.tint}
              yAxisColor={palette.icon}
              xAxisColor={palette.icon}
              yAxisTextStyle={{ color: palette.icon, fontSize: 11 }}
              xAxisLabelTextStyle={{ color: palette.icon, fontSize: 10 }}
              rulesColor={palette.icon}
              rulesType="solid"
              noOfSections={4}
              isAnimated={false}
            />
          ) : (
            <LineChart
              data={lineData}
              width={chartWidth}
              height={220}
              spacing={Math.max(36, Math.floor(chartWidth / (pointCount + 1)))}
              initialSpacing={16}
              color={palette.tint}
              thickness={2}
              dataPointsColor={palette.tint}
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
          )}
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
});
