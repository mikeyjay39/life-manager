import { Platform } from 'react-native';

import {
  attachWebFormEnterSubmit,
  shouldSubmitWebFormEnter,
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

describe('attachWebFormEnterSubmit', () => {
  const originalOs = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      get: () => originalOs,
    });
  });

  it('given capture Enter on input when fired then calls onSubmit', () => {
    // Given
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      get: () => 'web',
    });
    const listeners = new Map<string, EventListener>();
    const node = {
      addEventListener: (
        type: string,
        listener: EventListener,
        _options?: boolean | AddEventListenerOptions
      ) => {
        listeners.set(type, listener);
      },
      removeEventListener: (
        type: string,
        listener: EventListener,
        _options?: boolean | EventListenerOptions
      ) => {
        if (listeners.get(type) === listener) {
          listeners.delete(type);
        }
      },
    };
    const onSubmit = vi.fn();
    const detach = attachWebFormEnterSubmit(node, onSubmit);
    const preventDefault = vi.fn();

    // When — capture listener sees the event before TextInput stopPropagation
    listeners.get('keydown')?.(
      {
        key: 'Enter',
        preventDefault,
        target: { tagName: 'INPUT' },
      } as unknown as Event
    );

    // Then
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledTimes(1);

    detach();
    expect(listeners.has('keydown')).toBe(false);
  });

  it('given Platform web helper when native then shouldSubmit stays false', () => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      get: () => 'android',
    });
    expect(
      shouldSubmitWebFormEnter({ key: 'Enter', target: { tagName: 'INPUT' } })
    ).toBe(false);
  });
});
