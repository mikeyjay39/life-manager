import React from 'react';
import { TextInput as RNTextInput } from 'react-native';

import type { TextInputProps } from './text-input-types';

export type { TextInputProps };

/*
 * Shared typed field for Car Manager and Health Manager forms.
 *
 * Sequence (web):
 *
 * User -> Panel: open create or edit form
 * Panel -> TextInput: render shared field
 * TextInput -> RNTextInput: forward value, onChangeText, editable, style
 * RNTextInput -> DOM: mount input or textarea (react-native-web)
 * User -> Vimium: gi / input hints
 * Vimium -> DOM: XPath matches visible input/textarea (not readonly/disabled)
 * User -> DOM: type; React keeps controlled value
 *
 * Do not replace RN TextInput with a custom HTML input on web.
 * PR #166 did that and broke controlled typing; it was reverted.
 * react-native-web already emits real input/textarea that Vimium accepts.
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
