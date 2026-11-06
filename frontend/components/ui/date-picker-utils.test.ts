import { formatLocalDateToYmd, parseYmdToLocalDate } from './date-picker-utils';

describe('date-picker-utils', () => {
  it('given a valid YYYY-MM-DD when parsed then returns a local calendar date', () => {
    const date = parseYmdToLocalDate('2024-06-01');
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2024);
    expect(date!.getMonth()).toBe(5);
    expect(date!.getDate()).toBe(1);
  });

  it('given an invalid calendar day when parsed then returns null', () => {
    expect(parseYmdToLocalDate('2024-02-30')).toBeNull();
  });

  it('given a local Date when formatted then returns YYYY-MM-DD', () => {
    expect(formatLocalDateToYmd(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});
