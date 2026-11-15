import React, { useCallback } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { VerifyEmailPanel } from '@/components/auth/verify-email-panel';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { verifyEmailToken } from '@/lib/auth/email-flows';
import { useTenant } from '@/lib/tenant/TenantContext';
import { useTenantBranding } from '@/lib/tenant/TenantThemeContext';

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

/**
 * Verify email deep link:
 *   Email link /verify-email?token=...
 *     -> VerifyEmailPanel -> POST /auth/verify-email
 *     -> success/error + path to login
 */
export default function VerifyEmailScreen() {
  const { tenant } = useTenant();
  const { assets } = useTenantBranding();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = firstParam(params.token);

  const handleVerify = useCallback((rawToken: string) => verifyEmailToken(rawToken), []);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <Image source={assets.logo} style={styles.logo} accessibilityIgnoresInvertColors />
        <ThemedText type="title" style={styles.title}>
          {tenant.displayName}
        </ThemedText>
        <ThemedText type="subtitle" style={styles.subtitle}>
          Verify email
        </ThemedText>
        <VerifyEmailPanel token={token} onVerify={handleVerify} />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
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
