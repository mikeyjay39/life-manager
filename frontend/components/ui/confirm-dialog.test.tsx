import React from 'react';
import { Platform } from 'react-native';
import { cleanup, render, screen, fireEvent } from '@testing-library/react-native';

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

  it('given destructive dialog when confirm rendered then uses semantic danger fill', () => {
    // Given a destructive ConfirmDialog
    renderDialog({ confirmLabel: 'Delete', title: 'Delete item?' });

    // Then the confirm control uses palette.danger (not a hard-coded red)
    const confirm = screen.getByLabelText('Delete');
    const styleProp = confirm.props.style;
    const resolved =
      typeof styleProp === 'function' ? styleProp({ pressed: false }) : styleProp;
    expect(resolved).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          backgroundColor: defaultResolvedTheme.colors.light.danger,
        }),
      ])
    );
  });

  it('given visible dialog on web when Escape pressed then cancels without confirming', () => {
    // Given
    const originalOs = Platform.OS;
    const listeners: ((event: { key: string; preventDefault: () => void }) => void)[] =
      [];
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      get: () => 'web',
    });
    vi.stubGlobal('window', {
      addEventListener: (
        _type: string,
        handler: (event: { key: string; preventDefault: () => void }) => void
      ) => {
        listeners.push(handler);
      },
      removeEventListener: (
        _type: string,
        handler: (event: { key: string; preventDefault: () => void }) => void
      ) => {
        const index = listeners.indexOf(handler);
        if (index >= 0) {
          listeners.splice(index, 1);
        }
      },
    });
    const { onConfirm, onCancel } = renderDialog();

    // When
    listeners.forEach((handler) =>
      handler({ key: 'Escape', preventDefault: vi.fn() })
    );

    // Then
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    cleanup();
    vi.unstubAllGlobals();
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      get: () => originalOs,
    });
  });
});
