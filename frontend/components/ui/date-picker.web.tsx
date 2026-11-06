import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useColorPalette } from '@/lib/tenant/TenantThemeContext';

import type { DatePickerProps } from './date-picker-types';

export type { DatePickerProps };

/*
 * DatePicker pick / clear on web (activity):
 *
 * [*] --> ShowField
 * ShowField --> Picked : change on input type=date
 * ShowField --> Cleared : press Clear or clear the native control
 * Picked --> [*] : onChange(YYYY-MM-DD)
 * Cleared --> [*] : onChange('')
 */

export function DatePicker({
  value,
  onChange,
  accessibilityLabel,
  placeholder = 'YYYY-MM-DD',
  style,
  disabled = false,
}: DatePickerProps) {
  const palette = useColorPalette();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          marginBottom: 8,
        },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        },
        field: {
          flex: 1,
          borderWidth: 1,
          borderColor: palette.icon,
          borderRadius: 8,
          padding: 10,
          backgroundColor: palette.background,
          color: palette.text,
          fontSize: 16,
        },
        clear: {
          paddingVertical: 8,
          paddingHorizontal: 4,
        },
        clearText: {
          fontSize: 14,
          color: palette.tint,
          fontWeight: '600',
        },
      }),
    [palette]
  );

  return (
    <View style={[styles.root, style]}>
      <View style={styles.row}>
        {React.createElement('input', {
          type: 'date',
          value,
          disabled,
          'aria-label': accessibilityLabel,
          placeholder,
          onChange: (event: { target: { value: string } }) => {
            onChange(event.target.value);
          },
          style: styles.field as object,
        })}
        {value ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Clear ${accessibilityLabel}`}
            disabled={disabled}
            onPress={() => onChange('')}
            style={styles.clear}
          >
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
