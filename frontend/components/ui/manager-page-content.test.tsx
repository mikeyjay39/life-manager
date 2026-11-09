import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import {
  MANAGER_CONTENT_MAX_WIDTH,
  MANAGER_CONTENT_PADDING_X,
} from '@/components/ui/manager-layout';
import { ManagerPageContent } from '@/components/ui/manager-page-content';

describe('ManagerPageContent', () => {
  it('given body children when rendered then centers content with shared max width', () => {
    // Given
    render(
      <ManagerPageContent testID="manager-page">
        <Text>Body</Text>
      </ManagerPageContent>
    );

    // When
    const root = screen.getByTestId('manager-page');

    // Then
    expect(screen.getByText('Body')).toBeTruthy();
    expect(root.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          maxWidth: MANAGER_CONTENT_MAX_WIDTH,
          alignSelf: 'center',
          paddingHorizontal: MANAGER_CONTENT_PADDING_X,
          width: '100%',
        }),
      ])
    );
  });
});
