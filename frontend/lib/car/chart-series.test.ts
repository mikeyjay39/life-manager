import { describe, expect, it } from 'vitest';

import type { CarMaintenanceEventDto } from '@/lib/api/generated/life-manager/CarMaintenanceEventDto';

import {
  buildCarChartSeries,
  costCentsToUsd,
  downsamplePoints,
  filterToDefaultChartRange,
  mapCostSeries,
  mapEventTypeSeries,
  mapOdometerSeries,
  milesSinceLastOilChange,
  sortEventsByOccurredOnAsc,
  type CarChartPoint,
} from './chart-series';

function event(
  overrides: Partial<CarMaintenanceEventDto> &
    Pick<CarMaintenanceEventDto, 'id' | 'occurred_on' | 'event_type'>
): CarMaintenanceEventDto {
  return {
    car_id: 'c1',
    odometer_miles: null,
    cost_cents: null,
    title: null,
    notes: null,
    document_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('car chart-series mapping', () => {
  it('maps three odometer points in occurred_on ascending order', () => {
    // Given three events with odometer_miles on different dates (API newest-first)
    const events = [
      event({
        id: 'c',
        occurred_on: '2026-03-01',
        event_type: 'service',
        odometer_miles: 52000,
      }),
      event({
        id: 'a',
        occurred_on: '2026-01-01',
        event_type: 'oil_change',
        odometer_miles: 50000,
      }),
      event({
        id: 'b',
        occurred_on: '2026-02-01',
        event_type: 'tire',
        odometer_miles: 51000,
      }),
    ];
    // When mapping the odometer series
    const series = mapOdometerSeries(events);
    // Then points are in date order with miles values
    expect(series.points.map((p) => p.occurredOn)).toEqual([
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
    ]);
    expect(series.points.map((p) => p.value)).toEqual([50000, 51000, 52000]);
    expect(series.yAxisLabel).toBe('miles');
  });

  it('maps cost points from cost_cents to USD', () => {
    // Given events with cost_cents
    const events = [
      event({
        id: 'a',
        occurred_on: '2026-01-01',
        event_type: 'oil_change',
        cost_cents: 5999,
      }),
      event({
        id: 'b',
        occurred_on: '2026-02-01',
        event_type: 'tire',
        cost_cents: 20000,
      }),
    ];
    // When mapping cost
    const series = mapCostSeries(events);
    // Then Y values are dollars and the axis is USD
    expect(series.yAxisLabel).toBe('USD');
    expect(series.points.map((p) => p.value)).toEqual([59.99, 200]);
    expect(costCentsToUsd(5999)).toBe(59.99);
  });

  it('skips missing odometer and cost instead of plotting zero', () => {
    const events = [
      event({
        id: 'a',
        occurred_on: '2026-01-01',
        event_type: 'oil_change',
        odometer_miles: 100,
      }),
      event({
        id: 'b',
        occurred_on: '2026-02-01',
        event_type: 'service',
        odometer_miles: null,
        cost_cents: 1000,
      }),
      event({
        id: 'c',
        occurred_on: '2026-03-01',
        event_type: 'repair',
        odometer_miles: 200,
      }),
    ];
    expect(mapOdometerSeries(events).points).toEqual([
      { occurredOn: '2026-01-01', value: 100 },
      { occurredOn: '2026-03-01', value: 200 },
    ]);
    expect(mapCostSeries(events).points).toEqual([
      { occurredOn: '2026-02-01', value: 10 },
    ]);
  });

  it('groups mixed event_types into counts', () => {
    // Given mixed event types
    const events = [
      event({ id: 'a', occurred_on: '2026-01-01', event_type: 'oil_change' }),
      event({ id: 'b', occurred_on: '2026-02-01', event_type: 'tire' }),
      event({ id: 'c', occurred_on: '2026-03-01', event_type: 'oil_change' }),
      event({ id: 'd', occurred_on: '2026-04-01', event_type: 'brakes' }),
    ];
    // When mapping event type breakdown
    const series = mapEventTypeSeries(events);
    // Then counts group by type with display labels
    expect(series.counts).toEqual([
      { eventType: 'oil_change', label: 'Oil change', count: 2 },
      { eventType: 'tire', label: 'Tire', count: 1 },
      { eventType: 'brakes', label: 'Brakes', count: 1 },
    ]);
  });

  it('builds an empty odometer series when no odometer values exist', () => {
    const series = buildCarChartSeries(
      [
        event({
          id: 'a',
          occurred_on: '2026-01-01',
          event_type: 'service',
          cost_cents: 500,
        }),
      ],
      'odometer',
      new Date(2026, 10, 7)
    );
    expect(series.kind).toBe('odometer');
    if (series.kind === 'odometer') {
      expect(series.points).toEqual([]);
    }
  });

  it('maps a single odometer point without error', () => {
    const series = mapOdometerSeries([
      event({
        id: 'a',
        occurred_on: '2026-06-01',
        event_type: 'service',
        odometer_miles: 12345,
      }),
    ]);
    expect(series.points).toHaveLength(1);
    expect(series.points[0]).toEqual({
      occurredOn: '2026-06-01',
      value: 12345,
    });
  });

  it('filters to the default last-12-months window', () => {
    const now = new Date(2026, 10, 7);
    const events = [
      event({
        id: 'old',
        occurred_on: '2025-01-01',
        event_type: 'service',
        odometer_miles: 1,
      }),
      event({
        id: 'new',
        occurred_on: '2026-06-01',
        event_type: 'service',
        odometer_miles: 2,
      }),
    ];
    const inRange = filterToDefaultChartRange(events, now);
    expect(inRange.map((e) => e.id)).toEqual(['new']);
  });

  it('sorts by occurred_on ascending', () => {
    const sorted = sortEventsByOccurredOnAsc([
      event({ id: 'b', occurred_on: '2026-02-01', event_type: 'tire' }),
      event({ id: 'a', occurred_on: '2026-01-01', event_type: 'oil_change' }),
    ]);
    expect(sorted.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('downsamples long series while keeping first and last', () => {
    const points: CarChartPoint[] = [];
    for (let i = 0; i < 100; i++) {
      points.push({
        occurredOn: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
        value: i,
      });
    }
    const sampled = downsamplePoints(points, 10);
    expect(sampled).toHaveLength(10);
    expect(sampled[0]?.value).toBe(0);
    expect(sampled[9]?.value).toBe(99);
  });

  it('computes miles since last oil_change from later odometer', () => {
    // Given an oil_change and a later higher odometer reading
    const events = [
      event({
        id: 'a',
        occurred_on: '2026-01-01',
        event_type: 'oil_change',
        odometer_miles: 50000,
      }),
      event({
        id: 'b',
        occurred_on: '2026-06-01',
        event_type: 'service',
        odometer_miles: 53000,
      }),
    ];
    // When deriving the callout
    // Then miles since oil is the difference
    expect(milesSinceLastOilChange(events)).toBe(3000);
  });

  it('returns null miles-since-oil when oil odometer is missing', () => {
    expect(
      milesSinceLastOilChange([
        event({
          id: 'a',
          occurred_on: '2026-01-01',
          event_type: 'oil_change',
          odometer_miles: null,
        }),
        event({
          id: 'b',
          occurred_on: '2026-06-01',
          event_type: 'service',
          odometer_miles: 53000,
        }),
      ])
    ).toBeNull();
  });

  it('clears miles-since-oil when a later oil_change has no odometer', () => {
    // Given a prior oil with miles, then a later oil without miles
    expect(
      milesSinceLastOilChange([
        event({
          id: 'a',
          occurred_on: '2026-01-01',
          event_type: 'oil_change',
          odometer_miles: 50000,
        }),
        event({
          id: 'b',
          occurred_on: '2026-03-01',
          event_type: 'oil_change',
          odometer_miles: null,
        }),
        event({
          id: 'c',
          occurred_on: '2026-06-01',
          event_type: 'service',
          odometer_miles: 53000,
        }),
      ])
    ).toBeNull();
  });
});
