import { Platform } from 'react-native';

type WebKeyEvent = {
  key?: string;
  preventDefault?: () => void;
  metaKey?: boolean;
  ctrlKey?: boolean;
  target?: EventTarget | null;
  nativeEvent?: {
    key?: string;
    preventDefault?: () => void;
    metaKey?: boolean;
    ctrlKey?: boolean;
    target?: EventTarget | null;
  };
};

function readKey(event: WebKeyEvent): string | undefined {
  return event.key ?? event.nativeEvent?.key;
}

function readTarget(event: WebKeyEvent): EventTarget | null | undefined {
  return event.target ?? event.nativeEvent?.target;
}

function isMultilineField(target: EventTarget | null | undefined): boolean {
  if (target == null || typeof target !== 'object') {
    return false;
  }
  const el = target as {
    tagName?: string;
    getAttribute?: (name: string) => string | null;
  };
  const tag = el.tagName?.toLowerCase();
  if (tag === 'textarea') {
    return true;
  }
  return el.getAttribute?.('aria-multiline') === 'true';
}

/**
 * Decide whether Enter should submit a manager form on web.
 * Single-line Enter submits. Multiline Enter inserts a newline.
 * Multiline Ctrl/Cmd+Enter submits.
 */
export function shouldSubmitWebFormEnter(
  event: WebKeyEvent,
  platformOs: typeof Platform.OS = Platform.OS
): boolean {
  if (platformOs !== 'web') {
    return false;
  }
  if (readKey(event) !== 'Enter') {
    return false;
  }
  const meta = event.metaKey ?? event.nativeEvent?.metaKey ?? false;
  const ctrl = event.ctrlKey ?? event.nativeEvent?.ctrlKey ?? false;
  if (isMultilineField(readTarget(event))) {
    return meta || ctrl;
  }
  return true;
}

/**
 * Web View props that submit on Enter inside a manager form region.
 * Native returns an empty object.
 *
 * sequenceDiagram
 *   participant User
 *   participant Form as form region
 *   participant Helper as webFormEnterSubmitProps
 *   User->>Form: keydown Enter
 *   Form->>Helper: shouldSubmitWebFormEnter
 *   alt single-line or Ctrl/Cmd+Enter in textarea
 *     Helper->>Helper: preventDefault
 *     Helper->>Form: onSubmit()
 *   else textarea Enter
 *     Helper-->>Form: allow newline
 *   end
 */
export function webFormEnterSubmitProps(onSubmit: () => void): Record<string, unknown> {
  if (Platform.OS !== 'web') {
    return {};
  }
  return {
    onKeyDown: (event: WebKeyEvent) => {
      if (!shouldSubmitWebFormEnter(event)) {
        return;
      }
      event.preventDefault?.();
      event.nativeEvent?.preventDefault?.();
      onSubmit();
    },
  };
}
