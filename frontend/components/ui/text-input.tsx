import React from 'react';
import { TextInput as RNTextInput } from 'react-native';

import type { TextInputProps } from './text-input-types';

export type { TextInputProps };

/*
 * TextInput (shared form field):
 *
 * Web uses text-input.web.tsx so the DOM is a real input/textarea for Vimium.
 * Native keeps RN TextInput.
 */

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
  return (
    <RNTextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={placeholderTextColor}
      accessibilityLabel={accessibilityLabel}
      style={style}
      multiline={multiline}
      editable={editable}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      textAlignVertical={textAlignVertical}
      aria-required={ariaRequired}
      secureTextEntry={secureTextEntry}
      maxLength={maxLength}
      testID={testID}
    />
  );
}
