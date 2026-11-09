import React from 'react';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';

import {
  MANAGER_FEEDBACK_SUCCESS_MS,
  ManagerFeedbackBanner,
  useManagerFeedback,
} from '@/components/ui/manager-feedback';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';

function renderBanner(
  props: Partial<React.ComponentProps<typeof ManagerFeedbackBanner>> & {
    tone: 'success' | 'error';
    message: string;
  }
) {
  render(
    <TenantThemeTestProvider theme={defaultResolvedTheme}>
      <ManagerFeedbackBanner {...props} />
    </TenantThemeTestProvider>
  );
}

describe('ManagerFeedbackBanner', () => {
  it('given an error when rendered then shows message as an alert', () => {
    // Given / When
    renderBanner({ tone: 'error', message: 'Display name is required.' });

    // Then
    expect(screen.getByText('Display name is required.')).toBeTruthy();
    expect(screen.getByTestId('manager-feedback-error').props.accessibilityRole).toBe(
      'alert'
    );
  });

  it('given success when rendered then shows brief success message', () => {
    renderBanner({ tone: 'success', message: 'Document created.' });
    expect(screen.getByText('Document created.')).toBeTruthy();
    expect(screen.getByTestId('manager-feedback-success')).toBeTruthy();
  });

  it('given onDismiss when pressed then calls dismiss', () => {
    const onDismiss = vi.fn();
    renderBanner({
      tone: 'error',
      message: 'Save failed',
      onDismiss,
    });

    fireEvent.press(screen.getByLabelText('Dismiss feedback'));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('given no onDismiss when rendered then hides dismiss control', () => {
    renderBanner({ tone: 'success', message: 'Saved.' });
    expect(screen.queryByLabelText('Dismiss feedback')).toBeNull();
  });
});

describe('useManagerFeedback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('given showError when unrelated time passes then error stays visible', () => {
    // Given
    const { result } = renderHook(() => useManagerFeedback());

    // When
    act(() => {
      result.current.showError('Title is required.');
    });
    act(() => {
      vi.advanceTimersByTime(MANAGER_FEEDBACK_SUCCESS_MS * 3);
    });

    // Then
    expect(result.current.feedback).toEqual({
      tone: 'error',
      message: 'Title is required.',
    });
  });

  it('given showSuccess when duration elapses then success clears', () => {
    const { result } = renderHook(() => useManagerFeedback());

    act(() => {
      result.current.showSuccess('Car created.');
    });
    expect(result.current.feedback?.tone).toBe('success');

    act(() => {
      vi.advanceTimersByTime(MANAGER_FEEDBACK_SUCCESS_MS);
    });

    expect(result.current.feedback).toBeNull();
  });

  it('given error when showSuccess then newest replaces prior', () => {
    const { result } = renderHook(() => useManagerFeedback());

    act(() => {
      result.current.showError('Old error');
    });
    act(() => {
      result.current.showSuccess('HealthMember updated.');
    });

    expect(result.current.feedback).toEqual({
      tone: 'success',
      message: 'HealthMember updated.',
    });
  });

  it('given error when dismiss then feedback clears', () => {
    const { result } = renderHook(() => useManagerFeedback());

    act(() => {
      result.current.showError('Save failed');
    });
    act(() => {
      result.current.dismiss();
    });

    expect(result.current.feedback).toBeNull();
  });

  it('given success when clearError then success stays', () => {
    const { result } = renderHook(() => useManagerFeedback());

    act(() => {
      result.current.showSuccess('Document updated.');
    });
    act(() => {
      result.current.clearError();
    });

    expect(result.current.feedback?.tone).toBe('success');
  });

  it('given error when clearError then error clears', () => {
    const { result } = renderHook(() => useManagerFeedback());

    act(() => {
      result.current.showError('Validation failed');
    });
    act(() => {
      result.current.clearError();
    });

    expect(result.current.feedback).toBeNull();
  });
});
