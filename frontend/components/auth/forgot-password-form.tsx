import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { FieldLabel } from '@/components/ui/field-label';
import { useColorPalette } from '@/lib/tenant/TenantThemeContext';

type FieldErrors = {
  email?: string;
};

type ForgotPasswordFormProps = {
  onSubmit: (email: string) => Promise<{ success: boolean; error?: string; message?: string }>;
  loading?: boolean;
};

function validateEmail(email: string): FieldErrors {
  const errors: FieldErrors = {};
  const trimmed = email.trim();
  if (!trimmed) {
    errors.email = 'Email is required.';
  } else if (!trimmed.includes('@') || !trimmed.includes('.')) {
    errors.email = 'Enter a valid email address.';
  }
  return errors;
}

/**
 * Forgot-password flow:
 *   Form -> validate email -> POST /auth/password-reset/request
 *     | always show generic success when API succeeds
 *     | never reveal whether the email exists
 */
export function ForgotPasswordForm({
  onSubmit,
  loading: externalLoading = false,
}: ForgotPasswordFormProps) {
  const [email, setEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const palette = useColorPalette();
  const isBusy = loading || externalLoading;

  const handleSubmit = async () => {
    const errors = validateEmail(email);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setSubmitError(null);
    setSuccessMessage(null);
    setLoading(true);
    try {
      const result = await onSubmit(email.trim());
      if (result.success) {
        setSuccessMessage(
          result.message ??
            'If an account exists for that email, we sent a password reset link.'
        );
      } else {
        setSubmitError(result.error ?? 'Unknown error occurred.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailChange = (text: string) => {
    setEmail(text);
    if (fieldErrors.email) {
      setFieldErrors((prev) => ({ ...prev, email: undefined }));
    }
    if (submitError) {
      setSubmitError(null);
    }
  };

  if (successMessage) {
    return (
      <View style={styles.formContainer}>
        <ThemedText
          accessibilityRole="text"
          style={[styles.successText, { color: palette.success }]}
        >
          {successMessage}
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.formContainer}>
      <FieldLabel label="Email" required style={styles.label} />
      <TextInput
        style={[
          styles.input,
          fieldErrors.email ? styles.inputWithError : styles.inputDefaultSpacing,
          {
            backgroundColor: palette.background,
            borderColor: fieldErrors.email ? palette.danger : palette.border,
            color: palette.text,
          },
        ]}
        value={email}
        onChangeText={handleEmailChange}
        placeholder="Enter your email"
        placeholderTextColor={palette.muted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        editable={!isBusy}
        returnKeyType="go"
        onSubmitEditing={() => {
          if (!isBusy) {
            void handleSubmit();
          }
        }}
        accessibilityLabel="Email input"
        aria-required
        accessibilityHint={fieldErrors.email ?? 'Enter your email address'}
        accessibilityState={{ invalid: !!fieldErrors.email }}
      />
      {fieldErrors.email ? (
        <ThemedText style={[styles.errorText, { color: palette.danger }]}>
          {fieldErrors.email}
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
        label="Send reset link"
        onPress={() => void handleSubmit()}
        disabled={isBusy}
        loading={isBusy}
        accessibilityLabel="Send reset link button"
        accessibilityHint="Tap to request a password reset email"
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
  successText: {
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  button: {
    padding: 16,
    marginTop: 8,
  },
});
