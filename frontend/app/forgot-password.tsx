import React, { useCallback } from 'react';
import { Image, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { Link } from 'expo-router';

import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { requestPasswordReset } from '@/lib/auth/email-flows';
import { useTenant } from '@/lib/tenant/TenantContext';
import { useTenantBranding } from '@/lib/tenant/TenantThemeContext';

/**
 * Forgot password:
 *   Login link -> form -> POST /auth/password-reset/request
 *     -> generic “if an account exists…” success
 */
export default function ForgotPasswordScreen() {
  const { tenant } = useTenant();
  const { assets } = useTenantBranding();

  const handleSubmit = useCallback(
    (email: string) => requestPasswordReset(email),
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
            Forgot password
          </ThemedText>

          <ForgotPasswordForm onSubmit={handleSubmit} />

          <Link href="/login" style={styles.link}>
            <ThemedText type="link">Back to sign in</ThemedText>
          </Link>
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
  link: {
    marginTop: 24,
    alignSelf: 'center',
  },
});
