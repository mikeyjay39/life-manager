import { describe, expect, it } from 'vitest';

import {
  buildCreateDoctorVisitCommand,
  buildUpdateDoctorVisitCommand,
  emptyDoctorVisitForm,
  formFromDoctorVisitDto,
  parseDoctorVisitDto,
  unicodeScalarLength,
} from './doctor-visit-form-utils';

describe('doctor-visit-form-utils', () => {
  it('given empty text fields when build create then validation error', () => {
    // Given a form with only a date
    const form = emptyDoctorVisitForm('2026-01-15');
    // When building a create command
    const result = buildCreateDoctorVisitCommand('member-1', form);
    // Then client validation rejects
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/provider name, reason, or notes/i);
    }
  });

  it('given notes only when build create then command is ready', () => {
    // Given notes for an owned member
    const form = {
      ...emptyDoctorVisitForm('2026-01-15'),
      notes: '  checkup  ',
    };
    // When building a create command
    const result = buildCreateDoctorVisitCommand('member-1', form);
    // Then notes are trimmed and other text fields are null
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.health_member_id).toBe('member-1');
      expect(result.command.visited_on).toBe('2026-01-15');
      expect(result.command.notes).toBe('checkup');
      expect(result.command.provider_name).toBeNull();
      expect(result.command.reason).toBeNull();
    }
  });

  it('given dto when formFromDoctorVisitDto then fields map', () => {
    // Given a visit DTO
    const form = formFromDoctorVisitDto({
      id: 'v1',
      health_member_id: 'm1',
      visited_on: '2026-02-01',
      provider_name: 'Dr. Lee',
      reason: 'Follow-up',
      notes: null,
      created_at: '2026-02-01T00:00:00',
      updated_at: '2026-02-01T00:00:00',
    });
    // Then the edit form is filled
    expect(form.visitedOn).toBe('2026-02-01');
    expect(form.providerName).toBe('Dr. Lee');
    expect(form.reason).toBe('Follow-up');
    expect(form.notes).toBe('');
  });

  it('given valid edit form when build update then command omits member id', () => {
    // Given an edit form with reason
    const form = {
      ...emptyDoctorVisitForm('2026-03-01'),
      reason: 'Annual physical',
    };
    // When building update
    const result = buildUpdateDoctorVisitCommand(form);
    // Then payload has visited_on and reason
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.visited_on).toBe('2026-03-01');
      expect(result.command.reason).toBe('Annual physical');
      expect(result.command).not.toHaveProperty('health_member_id');
    }
  });

  it('given raw json when parseDoctorVisitDto then dto is typed', () => {
    // Given API JSON
    const dto = parseDoctorVisitDto({
      id: 'v1',
      health_member_id: 'm1',
      visited_on: '2026-01-15',
      provider_name: null,
      reason: null,
      notes: 'ok',
      created_at: 't1',
      updated_at: 't2',
    });
    // Then ids and notes parse
    expect(dto.id).toBe('v1');
    expect(dto.notes).toBe('ok');
  });

  it('counts unicode scalars for length checks', () => {
    expect(unicodeScalarLength('Dr')).toBe(2);
    expect(unicodeScalarLength('😀'.repeat(3))).toBe(3);
  });
});
