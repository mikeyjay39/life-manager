import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';

function renderDialog(overrides: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();

  render(
    <TenantThemeTestProvider theme={defaultResolvedTheme}>
      <ConfirmDialog
        visible
        title="Log Out"
        message="Are you sure you want to log out?"
        confirmLabel="Log Out"
        cancelLabel="Cancel"
        destructive
        onConfirm={onConfirm}
        onCancel={onCancel}
        {...overrides}
      />
    </TenantThemeTestProvider>
  );

  return { onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  it('given visible dialog when rendered then shows title and message', () => {
    renderDialog();
    expect(screen.getAllByText('Log Out').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Are you sure you want to log out?')).toBeTruthy();
  });

  it('given visible dialog when cancel pressed then calls onCancel', () => {
    const { onCancel } = renderDialog();
    fireEvent.press(screen.getByLabelText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('given visible dialog when confirm pressed then calls onConfirm', () => {
    const { onConfirm } = renderDialog();
    fireEvent.press(screen.getByLabelText('Log Out'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
