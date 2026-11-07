import type { CarMaintenanceEventDto } from '@/lib/api/generated/life-manager/CarMaintenanceEventDto';

/** Known event_type wire values (matches API / form utils). */
const KNOWN_EVENT_TYPES = [
  'oil_change',
  'tire',
  'brakes',
  'service',
  'repair',
  'other',
] as const;

const EVENT_TYPE_LABELS: Record<(typeof KNOWN_EVENT_TYPES)[number], string> = {
  oil_change: 'Oil change',
  tire: 'Tire',
  brakes: 'Brakes',
  service: 'Service',
  repair: 'Repair',
  other: 'Other',
};

export type CarChartMetric = 'odometer' | 'event_type' | 'cost';

export type CarChartPoint = {
  occurredOn: string;
  value: number;
};

export type EventTypeCount = {
  eventType: string;
  label: string;
  count: number;
};

export type OdometerSeries = {
  kind: 'odometer';
  yAxisLabel: string;
  points: CarChartPoint[];
};

export type CostSeries = {
  kind: 'cost';
  yAxisLabel: string;
  points: CarChartPoint[];
};

export type EventTypeSeries = {
  kind: 'event_type';
  yAxisLabel: string;
  counts: EventTypeCount[];
};

export type CarChartSeries = OdometerSeries | CostSeries | EventTypeSeries;

/** Cap rendered points so large histories stay usable. */
export const MAX_CHART_POINTS = 60;

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

/** Short x-axis label from YYYY-MM-DD (MM/DD). */
export function shortDateLabel(occurredOn: string): string {
  const parts = occurredOn.split('-');
  if (parts.length !== 3) return occurredOn;
  return `${parts[1]}/${parts[2]}`;
}

export function sortEventsByOccurredOnAsc(
  events: CarMaintenanceEventDto[]
): CarMaintenanceEventDto[] {
  return [...events].sort((a, b) => {
    if (a.occurred_on < b.occurred_on) return -1;
    if (a.occurred_on > b.occurred_on) return 1;
    if (a.created_at < b.created_at) return -1;
    if (a.created_at > b.created_at) return 1;
    return 0;
  });
}

/**
 * Keep events in the default window.
 * Filters on occurred_on inclusive from-date.
 */
export function filterToDefaultChartRange(
  events: CarMaintenanceEventDto[],
  now: Date = new Date()
): CarMaintenanceEventDto[] {
  const from = defaultChartFromDate(now);
  return events.filter((e) => e.occurred_on >= from);
}

/** Convert API cost_cents to USD for chart Y values. */
export function costCentsToUsd(costCents: number): number {
  return Math.round(costCents) / 100;
}

/**
 * Thin a long series for chart render.
 * Keeps first and last points; samples evenly in between.
 */
export function downsamplePoints(
  points: CarChartPoint[],
  maxPoints: number = MAX_CHART_POINTS
): CarChartPoint[] {
  if (points.length <= maxPoints) {
    return points;
  }
  if (maxPoints < 2) {
    return points.slice(0, maxPoints);
  }
  const result: CarChartPoint[] = [];
  const lastIndex = points.length - 1;
  for (let i = 0; i < maxPoints; i++) {
    const index =
      i === maxPoints - 1
        ? lastIndex
        : Math.round((i * lastIndex) / (maxPoints - 1));
    const point = points[index];
    if (point) {
      result.push(point);
    }
  }
  return result;
}

export function mapOdometerSeries(
  events: CarMaintenanceEventDto[]
): OdometerSeries {
  const points: CarChartPoint[] = [];
  for (const event of sortEventsByOccurredOnAsc(events)) {
    if (event.odometer_miles == null) continue;
    if (!Number.isFinite(event.odometer_miles)) continue;
    points.push({
      occurredOn: event.occurred_on,
      value: event.odometer_miles,
    });
  }
  return {
    kind: 'odometer',
    yAxisLabel: 'miles',
    points: downsamplePoints(points),
  };
}

export function mapCostSeries(events: CarMaintenanceEventDto[]): CostSeries {
  const points: CarChartPoint[] = [];
  for (const event of sortEventsByOccurredOnAsc(events)) {
    if (event.cost_cents == null) continue;
    if (!Number.isFinite(event.cost_cents)) continue;
    points.push({
      occurredOn: event.occurred_on,
      value: costCentsToUsd(event.cost_cents),
    });
  }
  return {
    kind: 'cost',
    yAxisLabel: 'USD',
    points: downsamplePoints(points),
  };
}

export function mapEventTypeSeries(
  events: CarMaintenanceEventDto[]
): EventTypeSeries {
  const tallies = new Map<string, number>();
  for (const type of KNOWN_EVENT_TYPES) {
    tallies.set(type, 0);
  }
  for (const event of events) {
    const key = event.event_type;
    tallies.set(key, (tallies.get(key) ?? 0) + 1);
  }
  const counts: EventTypeCount[] = [];
  for (const type of KNOWN_EVENT_TYPES) {
    const count = tallies.get(type) ?? 0;
    if (count === 0) continue;
    counts.push({
      eventType: type,
      label: EVENT_TYPE_LABELS[type],
      count,
    });
  }
  // Unknown types still appear so mixed data is visible.
  for (const [eventType, count] of tallies) {
    if (
      count === 0 ||
      (KNOWN_EVENT_TYPES as readonly string[]).includes(eventType)
    ) {
      continue;
    }
    counts.push({
      eventType,
      label: eventType,
      count,
    });
  }
  return {
    kind: 'event_type',
    yAxisLabel: 'count',
    counts,
  };
}

export function buildCarChartSeries(
  events: CarMaintenanceEventDto[],
  metric: CarChartMetric,
  now: Date = new Date()
): CarChartSeries {
  const inRange = filterToDefaultChartRange(events, now);
  switch (metric) {
    case 'odometer':
      return mapOdometerSeries(inRange);
    case 'cost':
      return mapCostSeries(inRange);
    case 'event_type':
      return mapEventTypeSeries(inRange);
  }
}

/**
 * Miles since last oil_change: latest odometer minus oil_change odometer.
 * Returns null when either value is missing.
 */
export function milesSinceLastOilChange(
  events: CarMaintenanceEventDto[]
): number | null {
  const sorted = sortEventsByOccurredOnAsc(events);
  let lastOilOdometer: number | null = null;
  let latestOdometer: number | null = null;
  for (const event of sorted) {
    const miles =
      event.odometer_miles != null && Number.isFinite(event.odometer_miles)
        ? event.odometer_miles
        : null;
    if (miles != null) {
      latestOdometer = miles;
    }
    if (event.event_type === 'oil_change') {
      // Latest oil_change wins; null odometer clears a prior oil baseline.
      lastOilOdometer = miles;
    }
  }
  if (lastOilOdometer == null || latestOdometer == null) {
    return null;
  }
  return Math.max(0, latestOdometer - lastOilOdometer);
}

export function seriesPointCount(series: CarChartSeries): number {
  if (series.kind === 'event_type') {
    return series.counts.length;
  }
  return series.points.length;
}
