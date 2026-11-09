import { useEffect, useRef, type RefObject } from 'react';
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

type DomListenerTarget = {
  addEventListener: (
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions
  ) => void;
  removeEventListener: (
    type: string,
    listener: EventListener,
    options?: boolean | EventListenerOptions
  ) => void;
};

/**
 * Capture-phase keydown on a form container.
 * Capture runs before react-native-web TextInput stopPropagation.
 */
export function attachWebFormEnterSubmit(
  node: DomListenerTarget,
  onSubmit: () => void
): () => void {
  const handleKeyDown: EventListener = (event) => {
    const keyEvent = event as unknown as WebKeyEvent & KeyboardEvent;
    if (!shouldSubmitWebFormEnter(keyEvent)) {
      return;
    }
    keyEvent.preventDefault();
    onSubmit();
  };
  node.addEventListener('keydown', handleKeyDown, true);
  return () => {
    node.removeEventListener('keydown', handleKeyDown, true);
  };
}

/**
 * Web: attach capture Enter-to-submit on a form region ref while active.
 *
 * sequenceDiagram
 *   participant User
 *   participant Field as TextInput DOM
 *   participant Form as form region capture
 *   participant Hook as useWebFormEnterSubmit
 *   User->>Field: keydown Enter
 *   Form->>Hook: capture before stopPropagation
 *   alt single-line or Ctrl/Cmd+Enter in textarea
 *     Hook->>Hook: preventDefault
 *     Hook->>Form: onSubmit()
 *   else textarea Enter
 *     Hook-->>Field: allow newline
 *   end
 */
export function useWebFormEnterSubmit(
  active: boolean,
  onSubmit: (() => void) | undefined,
  containerRef: RefObject<unknown>
): void {
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const enabled = active && typeof onSubmit === 'function';

  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) {
      return;
    }
    const node = containerRef.current as DomListenerTarget | null;
    if (
      node == null ||
      typeof node.addEventListener !== 'function' ||
      typeof node.removeEventListener !== 'function'
    ) {
      return;
    }
    return attachWebFormEnterSubmit(node, () => {
      onSubmitRef.current?.();
    });
  }, [enabled, containerRef]);
}
