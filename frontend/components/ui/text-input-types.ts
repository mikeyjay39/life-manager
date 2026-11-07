import type { StyleProp, TextStyle } from 'react-native';

export type TextInputKeyboardType =
  | 'default'
  | 'number-pad'
  | 'decimal-pad'
  | 'numeric'
  | 'email-address'
  | 'phone-pad'
  | 'url';

export type TextInputProps = {
  value: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  placeholderTextColor?: string;
  accessibilityLabel: string;
  style?: StyleProp<TextStyle>;
  multiline?: boolean;
  /** When false, the field is read-only and must not act as a typed focus target. */
  editable?: boolean;
  keyboardType?: TextInputKeyboardType;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  textAlignVertical?: 'auto' | 'top' | 'bottom' | 'center';
  'aria-required'?: boolean;
  secureTextEntry?: boolean;
  maxLength?: number;
  testID?: string;
};
