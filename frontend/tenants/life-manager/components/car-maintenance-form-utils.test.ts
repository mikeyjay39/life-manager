import { describe, expect, it } from 'vitest';

import {
  buildCreateCarMaintenanceEventCommand,
  buildUpdateCarMaintenanceEventCommand,
  emptyCarMaintenanceForm,
  eventTypeLabel,
  formFromCarMaintenanceEventDto,
  formatCostCentsAsDollars,
  formatCostCentsForDisplay,
  parseCarMaintenanceEventDto,
  parseCostDollarsToCents,
  unicodeScalarLength,
} from './car-maintenance-form-utils';

describe('car-maintenance-form-utils', () => {
  it('given empty detail fields when build create then validation error', () => {
    // Given a form with only date and type
    const form = emptyCarMaintenanceForm('2026-01-15');
    // When building a create command
    const result = buildCreateCarMaintenanceEventCommand('car-1', form);
    // Then client validation rejects
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/title, notes, odometer miles, or cost/i);
    }
  });

  it('given dollars cost when build create then cost_cents is set', () => {
    // Given oil change with odometer and cost
    const form = {
      ...emptyCarMaintenanceForm('2026-01-15'),
      eventType: 'oil_change' as const,
      odometerMiles: '50000',
      costDollars: '59.99',
    };
    // When building create
    const result = buildCreateCarMaintenanceEventCommand('car-1', form);
    // Then dollars convert to cents and car_id is set
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.car_id).toBe('car-1');
      expect(result.command.event_type).toBe('oil_change');
      expect(result.command.odometer_miles).toBe(50000);
      expect(result.command.cost_cents).toBe(5999);
      expect(result.command.occurred_on).toBe('2026-01-15');
    }
  });

  it('given blank cost when build create then cost_cents is null', () => {
    // Given notes only and blank cost
    const form = {
      ...emptyCarMaintenanceForm('2026-02-01'),
      notes: 'shop visit',
      costDollars: '  ',
    };
    // When building create
    const result = buildCreateCarMaintenanceEventCommand('car-1', form);
    // Then cost_cents is omitted as null
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.cost_cents).toBeNull();
      expect(result.command.notes).toBe('shop visit');
    }
  });

  it('given invalid cost when parse then error', () => {
    expect(parseCostDollarsToCents('-1').ok).toBe(false);
    expect(parseCostDollarsToCents('12.999').ok).toBe(false);
    expect(parseCostDollarsToCents('abc').ok).toBe(false);
  });

  it('formats cents for form and display', () => {
    expect(formatCostCentsAsDollars(null)).toBe('');
    expect(formatCostCentsAsDollars(5999)).toBe('59.99');
    expect(formatCostCentsForDisplay(null)).toBeNull();
    expect(formatCostCentsForDisplay(5999)).toBe('$59.99');
  });

  it('given dto when formFromCarMaintenanceEventDto then fields map', () => {
    // Given an event DTO
    const form = formFromCarMaintenanceEventDto({
      id: 'e1',
      car_id: 'c1',
      occurred_on: '2026-02-01',
      event_type: 'tire',
      odometer_miles: 42000,
      cost_cents: 12050,
      title: 'Rotated',
      notes: null,
      document_id: 'd1',
      created_at: 't',
      updated_at: 't',
    });
    // Then the edit form is filled
    expect(form.occurredOn).toBe('2026-02-01');
    expect(form.eventType).toBe('tire');
    expect(form.odometerMiles).toBe('42000');
    expect(form.costDollars).toBe('120.50');
    expect(form.title).toBe('Rotated');
    expect(form.documentId).toBe('d1');
  });

  it('given valid edit form when build update then command omits car_id', () => {
    // Given an edit form
    const form = {
      ...emptyCarMaintenanceForm('2026-03-01'),
      eventType: 'brakes' as const,
      title: 'Pads',
    };
    // When building update
    const result = buildUpdateCarMaintenanceEventCommand(form);
    // Then payload has fields and no car_id
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.occurred_on).toBe('2026-03-01');
      expect(result.command.event_type).toBe('brakes');
      expect(result.command.title).toBe('Pads');
      expect(result.command).not.toHaveProperty('car_id');
    }
  });

  it('given raw json when parseCarMaintenanceEventDto then dto is typed', () => {
    const dto = parseCarMaintenanceEventDto({
      id: 'e1',
      car_id: 'c1',
      occurred_on: '2026-01-15',
      event_type: 'oil_change',
      odometer_miles: 50000,
      cost_cents: 5999,
      title: null,
      notes: null,
      document_id: null,
      created_at: 't1',
      updated_at: 't2',
    });
    expect(dto.id).toBe('e1');
    expect(dto.cost_cents).toBe(5999);
  });

  it('labels known event types', () => {
    expect(eventTypeLabel('oil_change')).toBe('Oil change');
    expect(eventTypeLabel('unknown')).toBe('unknown');
  });

  it('counts unicode scalars for length checks', () => {
    expect(unicodeScalarLength('Oil')).toBe(3);
    expect(unicodeScalarLength('😀'.repeat(3))).toBe(3);
  });
});
