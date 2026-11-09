import { Platform } from 'react-native';

import {
  shouldSubmitWebFormEnter,
  webFormEnterSubmitProps,
} from '@/components/ui/web-form-enter-submit';

describe('shouldSubmitWebFormEnter', () => {
  it('given single-line Enter on web when checked then submits', () => {
    // Given / When / Then
    expect(
      shouldSubmitWebFormEnter(
        { key: 'Enter', target: { tagName: 'INPUT' } },
        'web'
      )
    ).toBe(true);
  });

  it('given textarea Enter on web when checked then does not submit', () => {
    expect(
      shouldSubmitWebFormEnter(
        { key: 'Enter', target: { tagName: 'TEXTAREA' } },
        'web'
      )
    ).toBe(false);
  });

  it('given textarea Ctrl+Enter on web when checked then submits', () => {
    expect(
      shouldSubmitWebFormEnter(
        { key: 'Enter', ctrlKey: true, target: { tagName: 'TEXTAREA' } },
        'web'
      )
    ).toBe(true);
  });

  it('given textarea Meta+Enter on web when checked then submits', () => {
    expect(
      shouldSubmitWebFormEnter(
        { key: 'Enter', metaKey: true, target: { tagName: 'TEXTAREA' } },
        'web'
      )
    ).toBe(true);
  });

  it('given Enter on native when checked then does not submit', () => {
    expect(
      shouldSubmitWebFormEnter(
        { key: 'Enter', target: { tagName: 'INPUT' } },
        'ios'
      )
    ).toBe(false);
  });
});

describe('webFormEnterSubmitProps', () => {
  const originalOs = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      get: () => originalOs,
    });
  });

  it('given web when Enter on input then calls onSubmit once', () => {
    // Given
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      get: () => 'web',
    });
    const onSubmit = vi.fn();
    const props = webFormEnterSubmitProps(onSubmit);
    const preventDefault = vi.fn();

    // When
    (props.onKeyDown as (event: unknown) => void)({
      key: 'Enter',
      preventDefault,
      target: { tagName: 'INPUT' },
    });

    // Then
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('given native when props built then returns empty object', () => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      get: () => 'android',
    });
    expect(webFormEnterSubmitProps(vi.fn())).toEqual({});
  });
});
