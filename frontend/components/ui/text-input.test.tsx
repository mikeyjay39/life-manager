import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { TextInput } from '@/components/ui/text-input';

describe('TextInput', () => {
  it('given an accessibilityLabel when rendered then the field keeps that accessible name', () => {
    // Given / When
    render(
      <TextInput
        value=""
        onChangeText={() => {}}
        accessibilityLabel="Create make"
        placeholder="Make"
      />
    );

    // Then
    expect(screen.getByLabelText('Create make')).toBeTruthy();
  });

  it('given editable text when the user types then onChangeText receives the new value', () => {
    // Given
    const onChangeText = vi.fn();
    render(
      <TextInput
        value=""
        onChangeText={onChangeText}
        accessibilityLabel="Create model"
      />
    );

    // When
    fireEvent.changeText(screen.getByLabelText('Create model'), 'Civic');

    // Then
    expect(onChangeText).toHaveBeenCalledWith('Civic');
  });

  it('given a multiline notes field when rendered then it keeps the notes accessible name', () => {
    render(
      <TextInput
        value="line1"
        onChangeText={() => {}}
        accessibilityLabel="Create notes"
        multiline
      />
    );

    expect(screen.getByLabelText('Create notes')).toBeTruthy();
  });
});
