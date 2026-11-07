import React, { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  TextInput as RNTextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import type { TextInputProps } from './text-input-types';

export type { TextInputProps };

/*
 * Web TextInput (activity):
 *
 * [*] --> Editable : editable true -> RN TextInput (real input/textarea)
 * [*] --> LockedDisplay : editable false -> View + Text (not a Vimium target)
 * Editable --> Typed : onChangeText
 * LockedDisplay --> [*] : show value or placeholder
 *
 * Editable path keeps react-native TextInput so controlled typing works
 * (PR #166 custom HTML broke that). Locked path avoids textarea: Vimium's
 * textInputXPath matches every textarea, including readonly ones.
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
  const flat = useMemo(
    () => (StyleSheet.flatten(style) ?? {}) as TextStyle,
    [style]
  );

  if (editable === false) {
    const {
      color,
      fontSize,
      fontWeight,
      ...viewOnly
    } = flat;
    const displayText = value || placeholder || '';
    const textColor = value
      ? color
      : (placeholderTextColor ?? color);

    return (
      <View
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="text"
        testID={testID}
        style={viewOnly as StyleProp<ViewStyle>}
      >
        <Text
          style={{
            color: textColor,
            fontSize,
            fontWeight,
          }}
        >
          {displayText}
        </Text>
      </View>
    );
  }

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
