import { useEffect, useRef, type RefObject } from 'react';
import { Platform } from 'react-native';

type WebKeyEvent = {
  key?: string;
  keyCode?: number;
  which?: number;
  isComposing?: boolean;
  preventDefault?: () => void;
  metaKey?: boolean;
  ctrlKey?: boolean;
  target?: EventTarget | null;
  nativeEvent?: {
    key?: string;
    keyCode?: number;
    which?: number;
    isComposing?: boolean;
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

function isImeComposing(event: WebKeyEvent): boolean {
  if (event.isComposing === true || event.nativeEvent?.isComposing === true) {
    return true;
  }
  // keyCode 229 = IME composition (legacy browsers / RN-web).
  const code = event.keyCode ?? event.nativeEvent?.keyCode ?? event.which ?? event.nativeEvent?.which;
  return code === 229;
}

function fieldKind(
  target: EventTarget | null | undefined
): 'single' | 'multiline' | 'other' {
  if (target == null || typeof target !== 'object') {
    return 'other';
  }
  const el = target as {
    tagName?: string;
    isContentEditable?: boolean;
    getAttribute?: (name: string) => string | null;
  };
  const tag = el.tagName?.toLowerCase();
  if (tag === 'textarea' || el.getAttribute?.('aria-multiline') === 'true') {
    return 'multiline';
  }
  if (tag === 'input') {
    const type = (el.getAttribute?.('type') ?? 'text').toLowerCase();
    // Skip non-text controls (button, checkbox, file, …).
    if (
      type === 'button' ||
      type === 'submit' ||
      type === 'reset' ||
      type === 'checkbox' ||
      type === 'radio' ||
      type === 'file' ||
      type === 'image' ||
      type === 'color' ||
      type === 'range'
    ) {
      return 'other';
    }
    return 'single';
  }
  if (el.isContentEditable === true) {
    return 'multiline';
  }
  return 'other';
}

/**
 * Decide whether Enter should submit a manager form on web.
 * Only text fields submit. Multiline Enter inserts a newline.
 * Multiline Ctrl/Cmd+Enter submits. Skip IME composition and buttons.
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
  if (isImeComposing(event)) {
    return false;
  }
  const kind = fieldKind(readTarget(event));
  if (kind === 'other') {
    return false;
  }
  const meta = event.metaKey ?? event.nativeEvent?.metaKey ?? false;
  const ctrl = event.ctrlKey ?? event.nativeEvent?.ctrlKey ?? false;
  if (kind === 'multiline') {
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
