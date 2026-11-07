import React, { useId, useMemo } from 'react';
import { StyleSheet, type TextStyle } from 'react-native';

import type { TextInputKeyboardType, TextInputProps } from './text-input-types';

export type { TextInputProps };

/*
 * TextInput on web (activity):
 *
 * [*] --> EditableField : editable true, mount input or textarea
 * [*] --> DisplayOnly : editable false, mount div (not a Vimium typed target)
 * EditableField --> Typed : change event
 * DisplayOnly --> [*] : show value only
 *
 * Renders a real HTML input/textarea so Vimium gi / input hints can focus it.
 * Locked fields are not input/textarea, because Vimium still matches readonly textareas.
 */

function htmlTypeAndInputMode(keyboardType: TextInputKeyboardType): {
  type: string;
  inputMode?: string;
} {
  switch (keyboardType) {
    case 'email-address':
      return { type: 'email', inputMode: 'email' };
    case 'phone-pad':
      return { type: 'tel', inputMode: 'tel' };
    case 'url':
      return { type: 'url', inputMode: 'url' };
    case 'number-pad':
    case 'numeric':
      return { type: 'text', inputMode: 'numeric' };
    case 'decimal-pad':
      return { type: 'text', inputMode: 'decimal' };
    default:
      return { type: 'text' };
  }
}

function flattenStyle(style: TextInputProps['style']): TextStyle {
  return (StyleSheet.flatten(style) ?? {}) as TextStyle;
}

function toDomStyle(
  flat: TextStyle,
  multiline: boolean,
  textAlignVertical: TextInputProps['textAlignVertical']
): React.CSSProperties {
  return {
    ...(flat as React.CSSProperties),
    color: flat.color as string | undefined,
    backgroundColor: (flat.backgroundColor as string | undefined) ?? 'transparent',
    borderWidth: flat.borderWidth,
    borderColor: flat.borderColor as string | undefined,
    borderRadius: flat.borderRadius,
    borderStyle: flat.borderWidth ? 'solid' : undefined,
    padding: flat.padding,
    paddingTop: flat.paddingTop ?? flat.paddingVertical,
    paddingBottom: flat.paddingBottom ?? flat.paddingVertical,
    paddingLeft: flat.paddingLeft ?? flat.paddingHorizontal,
    paddingRight: flat.paddingRight ?? flat.paddingHorizontal,
    margin: flat.margin,
    marginBottom: flat.marginBottom,
    fontSize: flat.fontSize,
    fontWeight: flat.fontWeight as React.CSSProperties['fontWeight'],
    width: flat.width,
    minHeight: flat.minHeight,
    height: flat.height,
    boxSizing: 'border-box',
    resize: multiline ? 'vertical' : undefined,
    verticalAlign: textAlignVertical === 'top' ? 'top' : undefined,
    whiteSpace: multiline ? 'pre-wrap' : undefined,
  };
}

export function TextInput({
  value,
  onChangeText,
  placeholder,
  placeholderTextColor,
  accessibilityLabel,
  style,
  multiline = false,
  editable = true,
  keyboardType = 'default',
  autoCapitalize,
  textAlignVertical,
  'aria-required': ariaRequired,
  secureTextEntry = false,
  maxLength,
  testID,
}: TextInputProps) {
  const flat = useMemo(() => flattenStyle(style), [style]);
  const { type, inputMode } = htmlTypeAndInputMode(keyboardType);
  const readOnly = editable === false;
  const fieldId = useId().replace(/:/g, '');
  const domStyle = toDomStyle(flat, multiline, textAlignVertical);

  const placeholderRule =
    placeholderTextColor && !readOnly
      ? React.createElement('style', {
          dangerouslySetInnerHTML: {
            __html: `[data-lm-ti="${fieldId}"]::placeholder{color:${placeholderTextColor};opacity:1;}`,
          },
        })
      : null;

  if (readOnly) {
    // Div is not a Vimium typed target (input/textarea/contenteditable).
    return React.createElement(
      'div',
      {
        'aria-label': accessibilityLabel,
        'aria-readonly': true,
        'data-testid': testID,
        style: domStyle,
      },
      value || ''
    );
  }

  const common = {
    value,
    placeholder,
    'aria-label': accessibilityLabel,
    'aria-required': ariaRequired || undefined,
    maxLength,
    'data-testid': testID,
    'data-lm-ti': fieldId,
    autoCapitalize,
    onChange: (event: { target: { value: string } }) => {
      if (!onChangeText) {
        return;
      }
      onChangeText(event.target.value);
    },
    style: domStyle,
  };

  const field = multiline
    ? React.createElement('textarea', {
        ...common,
        rows: 3,
      })
    : React.createElement('input', {
        ...common,
        type: secureTextEntry ? 'password' : type,
        inputMode,
      });

  if (!placeholderRule) {
    return field;
  }

  return React.createElement(React.Fragment, null, placeholderRule, field);
}
