import type { HealthReadingDto } from '@/lib/api/generated/life-manager/HealthReadingDto';
import {
  computeBmi,
  displayHeightCm,
  displayWeightKg,
  heightUnitLabel,
  type UnitSystem,
  weightUnitLabel,
} from '@/lib/health/units';

export type ChartMetric =
  | 'weight'
  | 'height'
  | 'blood_pressure'
  | 'heart_rate'
  | 'bmi';

export type ChartPoint = {
  recordedOn: string;
  value: number;
};

export type BloodPressureChartPoint = {
  recordedOn: string;
  systolic: number;
  diastolic: number;
};

export type SingleSeriesChart = {
  kind: 'single';
  metric: Exclude<ChartMetric, 'blood_pressure'>;
  yAxisLabel: string;
  points: ChartPoint[];
};

export type BloodPressureSeriesChart = {
  kind: 'blood_pressure';
  metric: 'blood_pressure';
  yAxisLabel: string;
  points: BloodPressureChartPoint[];
};

export type HealthChartSeries = SingleSeriesChart | BloodPressureSeriesChart;

/** YYYY-MM-DD for today in local calendar (date-only; no time zone shift). */
export function localTodayIsoDate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Inclusive from-date for the default last-12-months window. */
export function defaultChartFromDate(now: Date = new Date()): string {
  const from = new Date(now.getFullYear(), now.getMonth() - 12, now.getDate());
  return localTodayIsoDate(from);
}

export function sortReadingsByRecordedOnAsc(
  readings: HealthReadingDto[]
): HealthReadingDto[] {
  return [...readings].sort((a, b) => {
    if (a.recorded_on < b.recorded_on) return -1;
    if (a.recorded_on > b.recorded_on) return 1;
    return 0;
  });
}

/**
 * Keep readings in the default window.
 * If all readings fall inside the last 12 months, keep all of them.
 */
export function filterToDefaultChartRange(
  readings: HealthReadingDto[],
  now: Date = new Date()
): HealthReadingDto[] {
  const from = defaultChartFromDate(now);
  return readings.filter((r) => r.recorded_on >= from);
}

function bmiFromReading(reading: HealthReadingDto): number | null {
  if (reading.bmi != null && Number.isFinite(reading.bmi)) {
    return reading.bmi;
  }
  if (reading.height_cm != null && reading.weight_kg != null) {
    return computeBmi(reading.height_cm, reading.weight_kg);
  }
  return null;
}

export function mapWeightSeries(
  readings: HealthReadingDto[],
  unit: UnitSystem
): SingleSeriesChart {
  const points: ChartPoint[] = [];
  for (const reading of sortReadingsByRecordedOnAsc(readings)) {
    if (reading.weight_kg == null) continue;
    points.push({
      recordedOn: reading.recorded_on,
      value: displayWeightKg(reading.weight_kg, unit),
    });
  }
  return {
    kind: 'single',
    metric: 'weight',
    yAxisLabel: weightUnitLabel(unit),
    points,
  };
}

export function mapHeightSeries(
  readings: HealthReadingDto[],
  unit: UnitSystem
): SingleSeriesChart {
  const points: ChartPoint[] = [];
  for (const reading of sortReadingsByRecordedOnAsc(readings)) {
    if (reading.height_cm == null) continue;
    points.push({
      recordedOn: reading.recorded_on,
      value: displayHeightCm(reading.height_cm, unit),
    });
  }
  return {
    kind: 'single',
    metric: 'height',
    yAxisLabel: heightUnitLabel(unit),
    points,
  };
}

export function mapHeartRateSeries(
  readings: HealthReadingDto[]
): SingleSeriesChart {
  const points: ChartPoint[] = [];
  for (const reading of sortReadingsByRecordedOnAsc(readings)) {
    if (reading.heart_rate_bpm == null) continue;
    points.push({
      recordedOn: reading.recorded_on,
      value: reading.heart_rate_bpm,
    });
  }
  return {
    kind: 'single',
    metric: 'heart_rate',
    yAxisLabel: 'bpm',
    points,
  };
}

export function mapBmiSeries(readings: HealthReadingDto[]): SingleSeriesChart {
  const points: ChartPoint[] = [];
  for (const reading of sortReadingsByRecordedOnAsc(readings)) {
    const bmi = bmiFromReading(reading);
    if (bmi == null) continue;
    points.push({
      recordedOn: reading.recorded_on,
      value: bmi,
    });
  }
  return {
    kind: 'single',
    metric: 'bmi',
    yAxisLabel: 'BMI',
    points,
  };
}

export function mapBloodPressureSeries(
  readings: HealthReadingDto[]
): BloodPressureSeriesChart {
  const points: BloodPressureChartPoint[] = [];
  for (const reading of sortReadingsByRecordedOnAsc(readings)) {
    if (reading.systolic_mm_hg == null || reading.diastolic_mm_hg == null) {
      continue;
    }
    points.push({
      recordedOn: reading.recorded_on,
      systolic: reading.systolic_mm_hg,
      diastolic: reading.diastolic_mm_hg,
    });
  }
  return {
    kind: 'blood_pressure',
    metric: 'blood_pressure',
    yAxisLabel: 'mmHg',
    points,
  };
}

export function buildChartSeries(
  readings: HealthReadingDto[],
  metric: ChartMetric,
  unit: UnitSystem,
  now: Date = new Date()
): HealthChartSeries {
  const inRange = filterToDefaultChartRange(readings, now);
  switch (metric) {
    case 'weight':
      return mapWeightSeries(inRange, unit);
    case 'height':
      return mapHeightSeries(inRange, unit);
    case 'heart_rate':
      return mapHeartRateSeries(inRange);
    case 'bmi':
      return mapBmiSeries(inRange);
    case 'blood_pressure':
      return mapBloodPressureSeries(inRange);
  }
}

/** Short x-axis label from YYYY-MM-DD (MM/DD). */
export function shortDateLabel(recordedOn: string): string {
  const parts = recordedOn.split('-');
  if (parts.length !== 3) return recordedOn;
  return `${parts[1]}/${parts[2]}`;
}
