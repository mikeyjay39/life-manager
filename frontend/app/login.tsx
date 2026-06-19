import React from 'react';
import { StyleSheet, KeyboardAvoidingView, Platform, View } from 'react-native';
import { router } from 'expo-router';

import { LoginForm } from '@/components/auth/login-form';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/lib/tenant/TenantContext';

export default function LoginScreen() {
  const { login, isAuthenticated } = useAuth();
  const { tenant } = useTenant();

  React.useEffect(() => {
    if (isAuthenticated) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated]);

  const handleSubmit = async (username: string, password: string) => {
    const result = await login(username, password);
    if (result.success) {
      router.replace('/(tabs)');
    }
    return result;
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          <ThemedText type="title" style={styles.title}>
            {tenant.displayName}
          </ThemedText>
          <ThemedText type="subtitle" style={styles.subtitle}>
            Sign in to continue
          </ThemedText>

          <LoginForm onSubmit={handleSubmit} />
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
