import type { StyleProp, TextStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';

export type FieldLabelProps = {
  label: string;
  required?: boolean;
  style?: StyleProp<TextStyle>;
};

export function FieldLabel({ label, required = false, style }: FieldLabelProps) {
  const text = required ? `${label} *` : label;
  const accessibilityLabel = required ? `${label}, required` : label;

  return (
    <ThemedText style={style} accessibilityLabel={accessibilityLabel}>
      {text}
    </ThemedText>
  );
}
