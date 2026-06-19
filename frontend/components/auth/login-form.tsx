import React, { useState } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useColorPalette } from '@/lib/tenant/TenantThemeContext';

type LoginFormProps = {
  onSubmit: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  loading?: boolean;
};

export function LoginForm({ onSubmit, loading: externalLoading = false }: LoginFormProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const palette = useColorPalette();
  const isBusy = loading || externalLoading;

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter both username and password.');
      return;
    }

    setLoading(true);
    try {
      const result = await onSubmit(username, password);
      if (!result.success) {
        Alert.alert('Login Failed', result.error || 'Unknown error occurred.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.formContainer}>
      <ThemedText style={styles.label}>Username</ThemedText>
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: palette.background,
            borderColor: palette.icon,
            color: palette.text,
          },
        ]}
        value={username}
        onChangeText={setUsername}
        placeholder="Enter your username"
        placeholderTextColor={palette.icon}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!isBusy}
        accessibilityLabel="Username input"
        accessibilityHint="Enter your username to log in"
      />

      <ThemedText style={styles.label}>Password</ThemedText>
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: palette.background,
            borderColor: palette.icon,
            color: palette.text,
          },
        ]}
        value={password}
        onChangeText={setPassword}
        placeholder="Enter your password"
        placeholderTextColor={palette.icon}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        editable={!isBusy}
        accessibilityLabel="Password input"
        accessibilityHint="Enter your password to log in"
      />

      <TouchableOpacity
        style={[
          styles.button,
          {
            backgroundColor: palette.tint,
            opacity: isBusy ? 0.6 : 1,
          },
        ]}
        onPress={() => void handleLogin()}
        disabled={isBusy}
        accessibilityLabel="Sign in button"
        accessibilityHint="Tap to sign in with your credentials"
      >
        {isBusy ? (
          <ActivityIndicator color={palette.onTint} />
        ) : (
          <ThemedText style={[styles.buttonText, { color: palette.onTint }]}>
            Sign In
          </ThemedText>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  formContainer: {
    width: '100%',
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    fontSize: 16,
  },
  button: {
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
