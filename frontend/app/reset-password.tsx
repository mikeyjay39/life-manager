import React, { useCallback } from 'react';
import { Image, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { confirmPasswordReset } from '@/lib/auth/email-flows';
import { useTenant } from '@/lib/tenant/TenantContext';
import { useTenantBranding } from '@/lib/tenant/TenantThemeContext';

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

/**
 * Reset password deep link:
 *   Email link /reset-password?token=...
 *     -> ResetPasswordForm -> POST /auth/password-reset/confirm
 *     -> success + path to login
 */
export default function ResetPasswordScreen() {
  const { tenant } = useTenant();
  const { assets } = useTenantBranding();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = firstParam(params.token);

  const handleSubmit = useCallback(
    (rawToken: string, newPassword: string) => confirmPasswordReset(rawToken, newPassword),
    []
  );

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          <Image source={assets.logo} style={styles.logo} accessibilityIgnoresInvertColors />
          <ThemedText type="title" style={styles.title}>
            {tenant.displayName}
          </ThemedText>
          <ThemedText type="subtitle" style={styles.subtitle}>
            Reset password
          </ThemedText>

          <ResetPasswordForm token={token} onSubmit={handleSubmit} />
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
  },
  logo: {
    width: 72,
    height: 72,
    alignSelf: 'center',
    marginBottom: 16,
    borderRadius: 12,
  },
  title: {
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 40,
    opacity: 0.7,
  },
});
