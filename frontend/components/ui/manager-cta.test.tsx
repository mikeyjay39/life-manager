import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

import { ManagerCta } from '@/components/ui/manager-cta';
import {
  MANAGER_CTA_MAX_WIDTH,
  MANAGER_CTA_MIN_WIDTH,
} from '@/components/ui/manager-layout';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';

function renderCta(props: Partial<React.ComponentProps<typeof ManagerCta>> = {}) {
  const onPress = vi.fn();
  render(
    <TenantThemeTestProvider theme={defaultResolvedTheme}>
      <ManagerCta
        label="Save"
        onPress={onPress}
        accessibilityLabel="Save button"
        testID="manager-cta"
        {...props}
      />
    </TenantThemeTestProvider>
  );
  return { onPress };
}

describe('ManagerCta', () => {
  it('given default CTA when rendered then constrains width below full content stretch', () => {
    // Given / When
    renderCta();

    // Then — wrapper caps width so wide viewports do not stretch edge-to-edge.
    const wrap = screen.getByTestId('manager-cta');
    expect(wrap.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          maxWidth: MANAGER_CTA_MAX_WIDTH,
          minWidth: MANAGER_CTA_MIN_WIDTH,
          alignSelf: 'flex-start',
          width: '100%',
        }),
      ])
    );
    expect(MANAGER_CTA_MAX_WIDTH).toBeLessThan(720);
    expect(screen.getByLabelText('Save button')).toBeTruthy();
  });

  it('given fullWidth when rendered then stretches without a max-width cap', () => {
    renderCta({ fullWidth: true });
    const wrap = screen.getByTestId('manager-cta');
    expect(wrap.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          alignSelf: 'stretch',
          width: '100%',
        }),
      ])
    );
    expect(wrap.props.style).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          maxWidth: MANAGER_CTA_MAX_WIDTH,
        }),
      ])
    );
  });

  it('given primary CTA when pressed then calls onPress', () => {
    const { onPress } = renderCta();
    fireEvent.press(screen.getByLabelText('Save button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
