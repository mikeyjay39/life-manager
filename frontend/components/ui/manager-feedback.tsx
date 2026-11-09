import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useColorPalette } from '@/lib/tenant/TenantThemeContext';
import { withAlpha } from '@/lib/tenant/theme/color-utils';

/** Success tone auto-dismiss duration (ms). Errors do not auto-clear. */
export const MANAGER_FEEDBACK_SUCCESS_MS = 4000;

export type ManagerFeedbackTone = 'success' | 'error';

export type ManagerFeedbackMessage = {
  tone: ManagerFeedbackTone;
  message: string;
};

export type ManagerFeedbackState = ManagerFeedbackMessage | null;

export type ManagerFeedbackBannerProps = {
  tone: ManagerFeedbackTone;
  message: string;
  /** When set, shows a Dismiss control. Errors should stay until dismiss or fix. */
  onDismiss?: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Shared manager success/error banner (inline, not Alert).
 *
 * ```
 * [Activity]
 * Form -> Banner : showError | showSuccess
 * if tone = error
 *   Banner stays until Dismiss or clearError (user fixes cause)
 * else success
 *   Banner auto-clears after MANAGER_FEEDBACK_SUCCESS_MS
 *   or user presses Dismiss
 * end
 * note newest feedback replaces prior (no stack)
 * ```
 */
export function ManagerFeedbackBanner({
  tone,
  message,
  onDismiss,
  testID,
  style,
}: ManagerFeedbackBannerProps) {
  const palette = useColorPalette();
  const isError = tone === 'error';
  const accent = isError ? palette.danger : palette.success;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          width: '100%',
          borderRadius: 8,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: accent,
          backgroundColor: withAlpha(accent, 0.12),
          paddingHorizontal: 12,
          paddingVertical: 10,
          gap: 8,
        },
        row: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 12,
        },
        message: {
          flex: 1,
          color: accent,
        },
        dismiss: {
          color: accent,
          fontWeight: '600',
        },
      }),
    [accent]
  );

  return (
    <View
      style={[styles.root, style]}
      accessibilityRole="alert"
      accessibilityLiveRegion={isError ? 'assertive' : 'polite'}
      testID={testID ?? `manager-feedback-${tone}`}
    >
      <View style={styles.row}>
        <ThemedText type="body" style={styles.message}>
          {message}
        </ThemedText>
        {onDismiss ? (
          <Pressable
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Dismiss feedback"
            hitSlop={8}
          >
            <ThemedText type="meta" style={styles.dismiss}>
              Dismiss
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export type UseManagerFeedbackOptions = {
  /** Override success auto-dismiss. Default MANAGER_FEEDBACK_SUCCESS_MS. */
  successDurationMs?: number;
};

export type UseManagerFeedbackResult = {
  feedback: ManagerFeedbackState;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  dismiss: () => void;
  /** Clears only an error. Leaves a success message alone. */
  clearError: () => void;
};

/**
 * Hook for one shared feedback slot: newest replaces prior.
 * Success auto-clears; errors stay until dismiss or clearError.
 */
export function useManagerFeedback(
  options: UseManagerFeedbackOptions = {}
): UseManagerFeedbackResult {
  const successDurationMs = options.successDurationMs ?? MANAGER_FEEDBACK_SUCCESS_MS;
  const [feedback, setFeedback] = useState<ManagerFeedbackState>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const dismiss = useCallback(() => {
    clearTimer();
    setFeedback(null);
  }, [clearTimer]);

  const showSuccess = useCallback(
    (message: string) => {
      clearTimer();
      setFeedback({ tone: 'success', message });
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setFeedback((current) =>
          current?.tone === 'success' && current.message === message ? null : current
        );
      }, successDurationMs);
    },
    [clearTimer, successDurationMs]
  );

  const showError = useCallback(
    (message: string) => {
      clearTimer();
      setFeedback({ tone: 'error', message });
    },
    [clearTimer]
  );

  const clearError = useCallback(() => {
    setFeedback((current) => {
      if (current?.tone !== 'error') {
        return current;
      }
      clearTimer();
      return null;
    });
  }, [clearTimer]);

  return { feedback, showSuccess, showError, dismiss, clearError };
}
