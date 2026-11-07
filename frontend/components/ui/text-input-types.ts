import type { TextStyle, StyleProp } from 'react-native';

export type TextInputKeyboardType =
  | 'default'
  | 'email-address'
  | 'numeric'
  | 'phone-pad'
  | 'number-pad'
  | 'decimal-pad'
  | 'url';

export type TextInputProps = {
  value: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  placeholderTextColor?: string;
  accessibilityLabel: string;
  style?: StyleProp<TextStyle>;
  multiline?: boolean;
  editable?: boolean;
  keyboardType?: TextInputKeyboardType;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  textAlignVertical?: 'auto' | 'top' | 'bottom' | 'center';
  'aria-required'?: boolean;
  secureTextEntry?: boolean;
  maxLength?: number;
  testID?: string;
};
