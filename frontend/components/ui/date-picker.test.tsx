import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { DatePicker } from '@/components/ui/date-picker';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';

vi.mock('@react-native-community/datetimepicker', async () => {
  const ReactNative = await import('react-native');
  return {
    __esModule: true,
    default: ({
      onChange,
    }: {
      onChange: (event: { type: string }, date?: Date) => void;
    }) =>
      React.createElement(
        ReactNative.View,
        null,
        React.createElement(
          ReactNative.Pressable,
          {
            accessibilityLabel: 'Confirm picked date',
            onPress: () => onChange({ type: 'set' }, new Date(2024, 5, 1)),
          },
          React.createElement(ReactNative.Text, null, 'Confirm')
        ),
        React.createElement(
          ReactNative.Pressable,
          {
            accessibilityLabel: 'Dismiss date picker',
            onPress: () => onChange({ type: 'dismissed' }),
          },
          React.createElement(ReactNative.Text, null, 'Dismiss')
        )
      ),
  };
});

function renderPicker(props: Partial<React.ComponentProps<typeof DatePicker>> = {}) {
  const onChange = vi.fn();
  render(
    <TenantThemeTestProvider theme={defaultResolvedTheme}>
      <DatePicker
        value=""
        onChange={onChange}
        accessibilityLabel="Issue date"
        {...props}
      />
    </TenantThemeTestProvider>
  );
  return { onChange };
}

describe('DatePicker', () => {
  it('given empty value when a date is picked then onChange receives YYYY-MM-DD', () => {
    // Given
    const { onChange } = renderPicker();
    // When
    fireEvent.press(screen.getByLabelText('Issue date'));
    fireEvent.press(screen.getByLabelText('Confirm picked date'));
    // Then
    expect(onChange).toHaveBeenCalledWith('2024-06-01');
  });

  it('given a set value when Clear is pressed then onChange receives an empty string', () => {
    // Given
    const { onChange } = renderPicker({ value: '2026-12-31' });
    // When
    fireEvent.press(screen.getByLabelText('Clear Issue date'));
    // Then
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('given empty value when rendered then Clear is hidden', () => {
    renderPicker({ value: '' });
    expect(screen.queryByLabelText('Clear Issue date')).toBeNull();
  });
});
