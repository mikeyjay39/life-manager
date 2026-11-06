import type { StyleProp, ViewStyle } from 'react-native';

/** Controlled date field. `value` is YYYY-MM-DD or empty string. */
export type DatePickerProps = {
  value: string;
  onChange: (next: string) => void;
  accessibilityLabel: string;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
};
