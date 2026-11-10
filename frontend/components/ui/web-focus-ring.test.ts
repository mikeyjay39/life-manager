import { Platform } from 'react-native';

import {
  WEB_FOCUS_RING_OFFSET,
  WEB_FOCUS_RING_WIDTH,
  webFocusRingStyle,
} from '@/components/ui/web-focus-ring';

describe('webFocusRingStyle', () => {
  const originalOs = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      get: () => originalOs,
    });
  });

  it('given web and focused when styled then returns tint outline', () => {
    // Given
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      get: () => 'web',
    });

    // When
    const style = webFocusRingStyle(true, '#336699');

    // Then
    expect(style).toEqual(
      expect.objectContaining({
        outlineWidth: WEB_FOCUS_RING_WIDTH,
        outlineStyle: 'solid',
        outlineColor: '#336699',
        outlineOffset: WEB_FOCUS_RING_OFFSET,
      })
    );
  });

  it('given web and not focused when styled then returns null', () => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      get: () => 'web',
    });
    expect(webFocusRingStyle(false, '#336699')).toBeNull();
  });

  it('given native when focused then returns null', () => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      get: () => 'ios',
    });
    expect(webFocusRingStyle(true, '#336699')).toBeNull();
  });
});
