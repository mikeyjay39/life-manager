import React, { useMemo } from 'react';
import { StyleSheet, type TextStyle } from 'react-native';

import type { TextInputKeyboardType, TextInputProps } from './text-input-types';

export type { TextInputProps };

/*
 * TextInput on web (activity):
 *
 * [*] --> NativeField : mount input or textarea
 * NativeField --> Typed : change event when editable
 * NativeField --> [*] : readOnly when editable is false (not a Vimium typed target)
 *
 * Renders a real HTML input/textarea so Vimium gi / input hints can focus it.
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

export function TextInput({
  value,
  onChangeText,
  placeholder,
  placeholderTextColor: _placeholderTextColor,
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

  const domStyle: React.CSSProperties = {
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
    outline: 'none',
    resize: multiline ? 'vertical' : undefined,
    verticalAlign: textAlignVertical === 'top' ? 'top' : undefined,
  };
  void _placeholderTextColor;

  const common = {
    value,
    placeholder,
    readOnly: readOnly || undefined,
    'aria-label': accessibilityLabel,
    'aria-required': ariaRequired || undefined,
    'aria-readonly': readOnly || undefined,
    maxLength,
    'data-testid': testID,
    autoCapitalize,
    onChange: (event: { target: { value: string } }) => {
      if (readOnly || !onChangeText) {
        return;
      }
      onChangeText(event.target.value);
    },
    style: domStyle,
  };

  if (multiline) {
    return React.createElement('textarea', {
      ...common,
      rows: 3,
    });
  }

  return React.createElement('input', {
    ...common,
    type: secureTextEntry ? 'password' : type,
    inputMode,
  });
}
