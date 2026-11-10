import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Link } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { useColorPalette } from '@/lib/tenant/TenantThemeContext';

type VerifyResult = {
  success: boolean;
  error?: string;
  message?: string;
};

type VerifyEmailPanelProps = {
  token: string | undefined;
  onVerify: (token: string) => Promise<VerifyResult>;
};

/**
 * Verify-email flow:
 *   Screen -> read ?token= -> VerifyEmailPanel
 *     | missing token -> error, link to login (no API)
 *     | has token -> POST /auth/verify-email
 *       | ok -> success + link to login
 *       | err -> actionable error + link to login
 */
export function VerifyEmailPanel({ token, onVerify }: VerifyEmailPanelProps) {
  const palette = useColorPalette();
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(
    token?.trim() ? 'loading' : 'error'
  );
  const [message, setMessage] = useState<string | null>(
    token?.trim() ? null : 'This verification link is missing a token.'
  );
  const startedRef = useRef(false);

  useEffect(() => {
    const trimmed = token?.trim();
    if (!trimmed || startedRef.current) {
      return;
    }
    startedRef.current = true;

    let cancelled = false;
    const run = async () => {
      setStatus('loading');
      setMessage(null);
      const result = await onVerify(trimmed);
      if (cancelled) {
        return;
      }
      if (result.success) {
        setStatus('success');
        setMessage(result.message ?? 'Email verified. You can sign in now.');
      } else {
        setStatus('error');
        setMessage(result.error ?? 'Could not verify email.');
      }
    };
    void run();

    return () => {
      cancelled = true;
    };
  }, [token, onVerify]);

  return (
    <View style={styles.container}>
      {status === 'loading' ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator
            color={palette.tint}
            accessibilityLabel="Verifying email"
          />
          <ThemedText style={styles.loadingText}>Verifying your email…</ThemedText>
        </View>
      ) : null}

      {status === 'success' && message ? (
        <ThemedText
          accessibilityRole="text"
          style={[styles.message, { color: palette.success }]}
        >
          {message}
        </ThemedText>
      ) : null}

      {status === 'error' && message ? (
        <ThemedText
          accessibilityRole="alert"
          style={[styles.message, { color: palette.danger }]}
        >
          {message}
        </ThemedText>
      ) : null}

      {status !== 'loading' ? (
        <Link href="/login" style={styles.link}>
          <ThemedText type="link">Go to sign in</ThemedText>
        </Link>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 16,
  },
  message: {
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  link: {
    marginTop: 8,
    alignSelf: 'center',
  },
});
