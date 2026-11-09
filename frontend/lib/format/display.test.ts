import { describe, expect, it } from 'vitest';
import {
  DISPLAY_EMPTY,
  formatDisplayDate,
  formatDisplayInteger,
  formatUsdFromCents,
  parseWireDate,
  resolveDisplayLocale,
} from './display';

describe('resolveDisplayLocale', () => {
  it('given an explicit locale when resolved then that tag is kept', () => {
    // Given / When / Then
    expect(resolveDisplayLocale('de-DE')).toBe('de-DE');
    expect(resolveDisplayLocale('  fr-FR  ')).toBe('fr-FR');
  });

  it('given blank override when resolved then falls back to runtime', () => {
    // Given blank / When
    const resolved = resolveDisplayLocale('');
    // Then either runtime tag or undefined
    expect(resolved === undefined || typeof resolved === 'string').toBe(true);
  });
});

describe('parseWireDate', () => {
  it('given YYYY-MM-DD when parsed then uses local calendar parts', () => {
    // Given date-only wire value
    const parsed = parseWireDate('2026-01-15');
    // Then local Y/M/D match (no UTC shift)
    expect(parsed).not.toBeNull();
    expect(parsed!.getFullYear()).toBe(2026);
    expect(parsed!.getMonth()).toBe(0);
    expect(parsed!.getDate()).toBe(15);
  });

  it('given blank or invalid when parsed then returns null', () => {
    expect(parseWireDate(null)).toBeNull();
    expect(parseWireDate('')).toBeNull();
    expect(parseWireDate('not-a-date')).toBeNull();
    expect(parseWireDate('2026-13-40')).toBeNull();
  });
});

describe('formatDisplayDate', () => {
  it('Scenario: Date display is consistent', () => {
    // Given an ISO date
    const wire = '2026-01-15';
    // When it formats for en-US display
    const shown = formatDisplayDate(wire, 'en-US');
    // Then it matches locale date style (not raw YYYY-MM-DD)
    expect(shown).toBe(new Date(2026, 0, 15).toLocaleDateString('en-US'));
    expect(shown).not.toBe(wire);
  });

  it('given null date when formatted then shows em dash', () => {
    expect(formatDisplayDate(null)).toBe(DISPLAY_EMPTY);
    expect(formatDisplayDate('')).toBe(DISPLAY_EMPTY);
  });

  it('given ISO datetime when formatted then uses locale date', () => {
    const wire = '2024-06-01T00:00:00';
    expect(formatDisplayDate(wire, 'en-US')).toBe(
      new Date(wire).toLocaleDateString('en-US')
    );
  });
});

describe('formatUsdFromCents', () => {
  it('Scenario: Cost display is consistent', () => {
    // Given maintenance cost_cents
    const cents = 5999;
    // When formatted for en-US
    const shown = formatUsdFromCents(cents, 'en-US');
    // Then USD-style amount from cents
    expect(shown).toBe('$59.99');
  });

  it('given null cents when formatted then returns null', () => {
    expect(formatUsdFromCents(null)).toBeNull();
    expect(formatUsdFromCents(Number.NaN)).toBeNull();
  });

  it('given whole dollars when formatted then keeps two fraction digits', () => {
    expect(formatUsdFromCents(10000, 'en-US')).toBe('$100.00');
  });
});

describe('formatDisplayInteger', () => {
  it('given odometer miles when formatted then uses locale grouping', () => {
    expect(formatDisplayInteger(50000, 'en-US')).toBe('50,000');
  });

  it('given null when formatted then returns null', () => {
    expect(formatDisplayInteger(null)).toBeNull();
  });
});
