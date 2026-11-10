import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Link } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { FieldLabel } from '@/components/ui/field-label';
import { useColorPalette } from '@/lib/tenant/TenantThemeContext';

const MIN_PASSWORD_LEN = 8;

type FieldErrors = {
  password?: string;
  confirmPassword?: string;
};

type ResetPasswordFormProps = {
  token: string | undefined;
  onSubmit: (
    token: string,
    newPassword: string
  ) => Promise<{ success: boolean; error?: string; message?: string }>;
  loading?: boolean;
};

function validateFields(password: string, confirmPassword: string): FieldErrors {
  const errors: FieldErrors = {};

  if (!password.trim()) {
    errors.password = 'Password is required.';
  } else if (password.length < MIN_PASSWORD_LEN) {
    errors.password = `Password must be at least ${MIN_PASSWORD_LEN} characters.`;
  }

  if (!confirmPassword.trim()) {
    errors.confirmPassword = 'Confirm your password.';
  } else if (password !== confirmPassword) {
    errors.confirmPassword = 'Passwords do not match.';
  }

  return errors;
}

/**
 * Reset-password flow:
 *   Screen -> read ?token=
 *     | missing -> error, no API
 *     | present -> form -> POST /auth/password-reset/confirm
 *       | ok -> success + link to login
 *       | err -> actionable error
 */
export function ResetPasswordForm({
  token,
  onSubmit,
  loading: externalLoading = false,
}: ResetPasswordFormProps) {
  const trimmedToken = token?.trim() ?? '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const palette = useColorPalette();
  const isBusy = loading || externalLoading;

  if (!trimmedToken) {
    return (
      <View style={styles.formContainer}>
        <ThemedText
          accessibilityRole="alert"
          style={[styles.message, { color: palette.danger }]}
        >
          This reset link is missing a token.
        </ThemedText>
        <Link href="/login" style={styles.link}>
          <ThemedText type="link">Go to sign in</ThemedText>
        </Link>
      </View>
    );
  }

  if (successMessage) {
    return (
      <View style={styles.formContainer}>
        <ThemedText
          accessibilityRole="text"
          style={[styles.message, { color: palette.success }]}
        >
          {successMessage}
        </ThemedText>
        <Link href="/login" style={styles.link}>
          <ThemedText type="link">Go to sign in</ThemedText>
        </Link>
      </View>
    );
  }

  const handleSubmit = async () => {
    const errors = validateFields(password, confirmPassword);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setSubmitError(null);
    setLoading(true);
    try {
      const result = await onSubmit(trimmedToken, password);
      if (result.success) {
        setSuccessMessage(
          result.message ?? 'Password updated. You can sign in with your new password.'
        );
      } else {
        setSubmitError(result.error ?? 'Unknown error occurred.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = (text: string) => {
    setPassword(text);
    if (fieldErrors.password) {
      setFieldErrors((prev) => ({ ...prev, password: undefined }));
    }
    if (submitError) {
      setSubmitError(null);
    }
  };

  const handleConfirmPasswordChange = (text: string) => {
    setConfirmPassword(text);
    if (fieldErrors.confirmPassword) {
      setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }));
    }
    if (submitError) {
      setSubmitError(null);
    }
  };

  return (
    <View style={styles.formContainer}>
      <FieldLabel label="New password" required style={styles.label} />
      <TextInput
        style={[
          styles.input,
          fieldErrors.password ? styles.inputWithError : styles.inputDefaultSpacing,
          {
            backgroundColor: palette.background,
            borderColor: fieldErrors.password ? palette.danger : palette.border,
            color: palette.text,
          },
        ]}
        value={password}
        onChangeText={handlePasswordChange}
        placeholder="Choose a new password"
        placeholderTextColor={palette.muted}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        editable={!isBusy}
        accessibilityLabel="New password input"
        aria-required
        accessibilityHint={fieldErrors.password ?? 'Choose a new password'}
        accessibilityState={{ invalid: !!fieldErrors.password }}
      />
      {fieldErrors.password ? (
        <ThemedText style={[styles.errorText, { color: palette.danger }]}>
          {fieldErrors.password}
        </ThemedText>
      ) : null}

      <FieldLabel label="Confirm password" required style={styles.label} />
      <TextInput
        style={[
          styles.input,
          fieldErrors.confirmPassword ? styles.inputWithError : styles.inputDefaultSpacing,
          {
            backgroundColor: palette.background,
            borderColor: fieldErrors.confirmPassword ? palette.danger : palette.border,
            color: palette.text,
          },
        ]}
        value={confirmPassword}
        onChangeText={handleConfirmPasswordChange}
        placeholder="Re-enter your new password"
        placeholderTextColor={palette.muted}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        editable={!isBusy}
        returnKeyType="go"
        onSubmitEditing={() => {
          if (!isBusy) {
            void handleSubmit();
          }
        }}
        accessibilityLabel="Confirm password input"
        aria-required
        accessibilityHint={fieldErrors.confirmPassword ?? 'Re-enter your new password'}
        accessibilityState={{ invalid: !!fieldErrors.confirmPassword }}
      />
      {fieldErrors.confirmPassword ? (
        <ThemedText style={[styles.errorText, { color: palette.danger }]}>
          {fieldErrors.confirmPassword}
        </ThemedText>
      ) : null}

      {submitError ? (
        <ThemedText
          accessibilityRole="alert"
          style={[styles.submitErrorText, { color: palette.danger }]}
        >
          {submitError}
        </ThemedText>
      ) : null}

      <Button
        label="Set new password"
        onPress={() => void handleSubmit()}
        disabled={isBusy}
        loading={isBusy}
        accessibilityLabel="Set new password button"
        accessibilityHint="Tap to set your new password"
        style={styles.button}
      />
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
    fontSize: 16,
  },
  inputDefaultSpacing: {
    marginBottom: 20,
  },
  inputWithError: {
    marginBottom: 6,
  },
  errorText: {
    fontSize: 14,
    marginBottom: 14,
  },
  submitErrorText: {
    fontSize: 14,
    marginBottom: 8,
    textAlign: 'center',
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
  button: {
    padding: 16,
    marginTop: 8,
  },
});
