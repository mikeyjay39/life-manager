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
 * Vimium -> DOM: XPath matches visible input/textarea
 * User -> DOM: type; React keeps controlled value
 *
 * Web locked fields use text-input.web.tsx (View+Text). Vimium matches
 * every textarea (no readonly filter). Do not replace editable RN TextInput
 * with custom HTML input on web — PR #166 broke controlled typing.
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
