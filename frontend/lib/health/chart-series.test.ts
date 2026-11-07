import { describe, expect, it } from 'vitest';

import type { HealthReadingDto } from '@/lib/api/generated/life-manager/HealthReadingDto';

import {
  buildChartSeries,
  defaultChartFromDate,
  filterToDefaultChartRange,
  mapHeartRateSeries,
  mapWeightSeries,
  sortReadingsByRecordedOnAsc,
} from './chart-series';

function reading(
  overrides: Partial<HealthReadingDto> &
    Pick<HealthReadingDto, 'id' | 'recorded_on'>
): HealthReadingDto {
  return {
    health_member_id: 'm1',
    height_cm: null,
    weight_kg: null,
    systolic_mm_hg: null,
    diastolic_mm_hg: null,
    heart_rate_bpm: null,
    notes: null,
    bmi: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('chart-series mapping', () => {
  it('maps three weight points in recorded_on ascending order', () => {
    // Given three readings with weight_kg on different dates (API newest-first)
    const readings = [
      reading({ id: 'c', recorded_on: '2026-03-01', weight_kg: 72 }),
      reading({ id: 'a', recorded_on: '2026-01-01', weight_kg: 70 }),
      reading({ id: 'b', recorded_on: '2026-02-01', weight_kg: 71 }),
    ];
    // When mapping the weight series
    const series = mapWeightSeries(readings, 'metric');
    // Then points are in date order with metric kg values
    expect(series.points.map((p) => p.recordedOn)).toEqual([
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
    ]);
    expect(series.points.map((p) => p.value)).toEqual([70, 71, 72]);
    expect(series.yAxisLabel).toBe('kg');
  });

  it('converts weight chart points to lb in imperial mode without API imperial fields', () => {
    // Given metric API weight
    const readings = [
      reading({ id: 'a', recorded_on: '2026-01-01', weight_kg: 70 }),
    ];
    // When mapping with imperial preference
    const series = mapWeightSeries(readings, 'imperial');
    // Then values and label use lb (client conversion only)
    expect(series.yAxisLabel).toBe('lb');
    expect(series.points[0]?.value).toBe(154.3);
  });

  it('skips missing metrics instead of plotting zero', () => {
    // Given some readings without heart_rate_bpm
    const readings = [
      reading({ id: 'a', recorded_on: '2026-01-01', heart_rate_bpm: 60 }),
      reading({ id: 'b', recorded_on: '2026-02-01', heart_rate_bpm: null }),
      reading({ id: 'c', recorded_on: '2026-03-01', heart_rate_bpm: 70 }),
    ];
    // When mapping heart rate
    const series = mapHeartRateSeries(readings);
    // Then only present values appear
    expect(series.points).toEqual([
      { recordedOn: '2026-01-01', value: 60 },
      { recordedOn: '2026-03-01', value: 70 },
    ]);
  });

  it('builds an empty series when no points exist for the metric', () => {
    const series = buildChartSeries(
      [reading({ id: 'a', recorded_on: '2026-01-01', notes: 'only notes' })],
      'weight',
      'metric',
      new Date(2026, 10, 7)
    );
    expect(series.kind).toBe('single');
    if (series.kind === 'single') {
      expect(series.points).toEqual([]);
    }
  });

  it('maps a single weight point without error', () => {
    const series = mapWeightSeries(
      [reading({ id: 'a', recorded_on: '2026-06-01', weight_kg: 68.5 })],
      'metric'
    );
    expect(series.points).toHaveLength(1);
    expect(series.points[0]).toEqual({
      recordedOn: '2026-06-01',
      value: 68.5,
    });
  });

  it('maps dual BP series and skips incomplete BP rows', () => {
    const readings = [
      reading({
        id: 'a',
        recorded_on: '2026-01-01',
        systolic_mm_hg: 120,
        diastolic_mm_hg: 80,
      }),
      reading({
        id: 'b',
        recorded_on: '2026-02-01',
        systolic_mm_hg: 130,
        diastolic_mm_hg: null,
      }),
    ];
    const series = buildChartSeries(
      readings,
      'blood_pressure',
      'metric',
      new Date(2026, 10, 7)
    );
    expect(series.kind).toBe('blood_pressure');
    if (series.kind === 'blood_pressure') {
      expect(series.points).toEqual([
        { recordedOn: '2026-01-01', systolic: 120, diastolic: 80 },
      ]);
      expect(series.yAxisLabel).toBe('mmHg');
    }
  });

  it('keeps BMI metric-based even when unit preference is imperial', () => {
    const readings = [
      reading({
        id: 'a',
        recorded_on: '2026-01-01',
        height_cm: 180,
        weight_kg: 70,
        bmi: null,
      }),
    ];
    const metric = buildChartSeries(
      readings,
      'bmi',
      'metric',
      new Date(2026, 10, 7)
    );
    const imperial = buildChartSeries(
      readings,
      'bmi',
      'imperial',
      new Date(2026, 10, 7)
    );
    expect(metric.kind).toBe('single');
    expect(imperial.kind).toBe('single');
    if (metric.kind === 'single' && imperial.kind === 'single') {
      expect(metric.points[0]?.value).toBe(21.6);
      expect(imperial.points[0]?.value).toBe(21.6);
      expect(metric.yAxisLabel).toBe('BMI');
    }
  });

  it('filters to the last 12 months and sorts ascending', () => {
    const now = new Date(2026, 10, 7);
    const readings = [
      reading({ id: 'old', recorded_on: '2025-01-01', weight_kg: 80 }),
      reading({ id: 'new', recorded_on: '2026-05-01', weight_kg: 70 }),
      reading({ id: 'mid', recorded_on: '2026-01-15', weight_kg: 71 }),
    ];
    const from = defaultChartFromDate(now);
    expect(from).toBe('2025-11-07');
    const filtered = filterToDefaultChartRange(readings, now);
    expect(filtered.map((r) => r.id)).toEqual(['new', 'mid']);
    expect(sortReadingsByRecordedOnAsc(filtered).map((r) => r.id)).toEqual([
      'mid',
      'new',
    ]);
  });
});
