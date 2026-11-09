import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import React, { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useColorPalette } from '@/lib/tenant/TenantThemeContext';

import type { DatePickerProps } from './date-picker-types';
import { formatLocalDateToYmd, parseYmdToLocalDate } from './date-picker-utils';

export type { DatePickerProps };

/*
 * DatePicker pick / clear (activity):
 *
 * [*] --> ShowField
 * ShowField --> OpenPicker : press field
 * ShowField --> Cleared : press Clear (when value set)
 * Cleared --> [*] : onChange('')
 * OpenPicker --> ShowField : dismiss / Android cancel / iOS Done
 * OpenPicker --> Picked : user selects date (event type set)
 * Picked --> ShowField : onChange(YYYY-MM-DD)
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
  const [open, setOpen] = useState(false);
  const selected = parseYmdToLocalDate(value) ?? new Date();

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
          borderColor: palette.border,
          borderRadius: 8,
          padding: 10,
          backgroundColor: palette.background,
        },
        fieldText: {
          color: value ? palette.text : palette.muted,
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
    [palette, value]
  );

  const handleNativeChange = (event: DateTimePickerEvent, date?: Date) => {
    if (event.type === 'dismissed') {
      setOpen(false);
      return;
    }
    if (event.type === 'set' && date) {
      onChange(formatLocalDateToYmd(date));
      setOpen(false);
      return;
    }
    setOpen(false);
  };

  return (
    <View style={[styles.root, style]}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityHint="Opens a date picker"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => setOpen(true)}
          style={styles.field}
        >
          <Text style={styles.fieldText}>{value || placeholder}</Text>
        </Pressable>
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
      {open ? (
        <DateTimePicker
          value={selected}
          mode="date"
          display={Platform.OS === 'ios' ? 'compact' : 'default'}
          onChange={handleNativeChange}
        />
      ) : null}
    </View>
  );
}
