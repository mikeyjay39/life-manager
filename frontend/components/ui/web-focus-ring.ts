import { Platform, type ViewStyle } from 'react-native';

/** Visible keyboard focus outline width on web. */
export const WEB_FOCUS_RING_WIDTH = 2;
/** Gap between control edge and focus outline on web. */
export const WEB_FOCUS_RING_OFFSET = 2;

/**
 * Web keyboard focus ring. Native returns null (no outline change).
 *
 * sequenceDiagram
 *   participant User
 *   participant Control
 *   participant Style as webFocusRingStyle
 *   User->>Control: Tab (web)
 *   Control->>Style: focused true, tint color
 *   Style-->>Control: outlineWidth/Color/Offset
 *   Control->>User: visible focus ring
 *   Note over Style: Platform.OS not web -> null
 */
export function webFocusRingStyle(
  focused: boolean | undefined,
  outlineColor: string
): ViewStyle | null {
  if (Platform.OS !== 'web' || !focused) {
    return null;
  }
  return {
    outlineWidth: WEB_FOCUS_RING_WIDTH,
    outlineStyle: 'solid',
    outlineColor,
    outlineOffset: WEB_FOCUS_RING_OFFSET,
  } as ViewStyle;
}
