import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

/**
 * On web, Escape calls onClose while active is true.
 * Use for ConfirmDialog and other Modal panels.
 *
 * sequenceDiagram
 *   participant User
 *   participant Window
 *   participant Hook as useWebEscapeClose
 *   User->>Window: keydown Escape
 *   Window->>Hook: listener
 *   alt active
 *     Hook->>Hook: preventDefault
 *     Hook->>Hook: onClose()
 *   else inactive
 *     Hook-->>Window: ignore
 *   end
 */
export function useWebEscapeClose(active: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (Platform.OS !== 'web' || !active) {
      return;
    }
    if (
      typeof window === 'undefined' ||
      typeof window.addEventListener !== 'function'
    ) {
      return;
    }

    // Keep this window reference for cleanup (tests may replace global window).
    const target = window;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      onCloseRef.current();
    };

    target.addEventListener('keydown', handleKeyDown);
    return () => {
      if (typeof target.removeEventListener === 'function') {
        target.removeEventListener('keydown', handleKeyDown);
      }
    };
  }, [active]);
}
