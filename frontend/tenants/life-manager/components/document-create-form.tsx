import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { FieldLabel } from '@/components/ui/field-label';
import { ManagerFeedbackBanner } from '@/components/ui/manager-feedback';
import { useWebFormEnterSubmit } from '@/components/ui/web-form-enter-submit';
import { useAuth } from '@/contexts/AuthContext';
import { useProtonConnect } from '@/contexts/ProtonConnectContext';
import { apiFetch } from '@/lib/api/client';
import type { CreateDocumentCommand, DocumentDto } from '@/lib/api/types';
import { useColorPalette } from '@/lib/tenant/TenantThemeContext';
import { parseOptionalDateInput } from './document-create-form-utils';

function parseTags(input: string): string[] {
  return input
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

async function assetToFile(asset: DocumentPickerAsset): Promise<File> {
  const filename = asset.name?.trim() || 'upload';
  if (asset.file?.name?.trim()) {
    return asset.file;
  }
  if (asset.file) {
    return new File([asset.file], filename, {
      type: asset.file.type || asset.mimeType || 'application/octet-stream',
    });
  }
  const response = await fetch(asset.uri);
  const blob = await response.blob();
  return new File([blob], filename, {
    type: asset.mimeType || blob.type || 'application/octet-stream',
  });
}

type DocumentCreateFormProps = {
  /** Fires after a successful create with a short success message. */
  onDocumentCreated?: (successMessage: string) => void;
  /** Lets the parent block Cancel while a create request is in flight. */
  onSubmittingChange?: (submitting: boolean) => void;
};

/**
 * Inline create-document fields for ManagerFormVsResults.
 * Parent owns Add / Cancel expand state; this form owns Submit.
 *
 * ```
 * [*] --> clear submitError
 *     --> validate fields
 *         | invalid --> showSubmitError (inline banner) --> [*]
 *         | valid --> POST (multipart or Proton JSON)
 *             | fail --> showSubmitError; keep form open --> [*]
 *             | ok --> clear error; onDocumentCreated(message) --> [*]
 * ```
 */
export default function DocumentCreateForm({
  onDocumentCreated,
  onSubmittingChange,
}: DocumentCreateFormProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [issuedDateInput, setIssuedDateInput] = useState('');
  const [expireDateInput, setExpireDateInput] = useState('');
  const [pickedFile, setPickedFile] = useState<DocumentPickerAsset | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { token, handleUnauthorized } = useAuth();
  const { session: protonSession, isSupported: protonSupported } = useProtonConnect();
  const palette = useColorPalette();
  const isWeb = Platform.OS === 'web';

  useEffect(() => {
    onSubmittingChange?.(loading);
  }, [loading, onSubmittingChange]);

  useEffect(() => {
    return () => {
      onSubmittingChange?.(false);
    };
  }, [onSubmittingChange]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          width: '100%',
          gap: 8,
        },
        label: {
          fontSize: 16,
          marginBottom: 4,
          color: palette.text,
        },
        input: {
          borderWidth: 1,
          borderColor: palette.icon,
          borderRadius: 8,
          padding: 10,
          marginBottom: 8,
          color: palette.text,
          backgroundColor: palette.background,
        },
        inputMultiline: {
          minHeight: 100,
        },
        fileRow: {
          flexDirection: 'row',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 8,
        },
        secondaryButton: {
          paddingVertical: 10,
          paddingHorizontal: 14,
        },
        secondaryButtonText: {
          fontSize: 15,
        },
        fileName: {
          flex: 1,
          minWidth: 80,
          fontSize: 14,
          color: palette.text,
        },
        hint: {
          fontSize: 14,
          color: palette.icon,
        },
        clearLink: {
          fontSize: 14,
          color: palette.tint,
          fontWeight: '600',
        },
        errorBanner: {
          paddingVertical: 8,
          gap: 6,
        },
        errorText: {
          fontSize: 14,
          color: palette.danger,
        },
        actions: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 12,
          marginTop: 4,
        },
        submitButton: {
          minWidth: 120,
        },
      }),
    [palette]
  );

  const resetForm = () => {
    setTitle('');
    setContent('');
    setTagsInput('');
    setIssuedDateInput('');
    setExpireDateInput('');
    setPickedFile(null);
    setSubmitError(null);
  };

  const showSubmitError = (message: string) => {
    setSubmitError(message);
  };

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.length) {
      return;
    }
    setPickedFile(result.assets[0]);
  };

  const clearFile = () => setPickedFile(null);

  const handleSubmit = async () => {
    if (loading) {
      return;
    }
    setSubmitError(null);

    if (!token) {
      showSubmitError('No authentication token available.');
      return;
    }
    if (!title.trim() || !content.trim()) {
      showSubmitError('Please enter a title and content.');
      return;
    }

    if (isWeb && pickedFile && !protonSession) {
      showSubmitError('Connect Proton Drive before uploading a file on web.');
      return;
    }

    const tags = parseTags(tagsInput);

    const issuedDate = parseOptionalDateInput(issuedDateInput);
    if (!issuedDate.ok) {
      showSubmitError('Issue date must be in YYYY-MM-DD format.');
      return;
    }

    const expireDate = parseOptionalDateInput(expireDateInput);
    if (!expireDate.ok) {
      showSubmitError('Expire date must be in YYYY-MM-DD format.');
      return;
    }

    setLoading(true);
    try {
      if (isWeb && pickedFile && protonSession) {
        const proton = await import('@/lib/proton-drive/load-proton.web');
        const file = await assetToFile(pickedFile);
        const storage = await proton.uploadToLifeManagerFolder(file, undefined, pickedFile.name);
        const payload: CreateDocumentCommand = {
          title: title.trim(),
          content: content.trim(),
          tags,
          issued_date: issuedDate.value,
          expire_date: expireDate.value,
          storage: {
            provider: storage.provider,
            share_id: storage.shareId,
            node_id: storage.nodeId,
            filename: storage.filename,
            mime_type: storage.mimeType,
          },
        };

        const response = await apiFetch('/documents/json', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          onUnauthorized: handleUnauthorized,
        });

        const bodyText = await response.text();
        if (!response.ok) {
          throw new Error(
            bodyText
              ? `Request failed (${response.status}): ${bodyText}`
              : `Request failed with status ${response.status}`
          );
        }

        let message = 'Document created.';
        try {
          const data = JSON.parse(bodyText) as DocumentDto;
          if (data.id) {
            message = `Document "${data.title ?? title.trim()}" created.`;
          }
        } catch {
          // use default message
        }
        resetForm();
        onDocumentCreated?.(message);
        return;
      }

      const payload: CreateDocumentCommand = {
        title: title.trim(),
        content: content.trim(),
        tags,
        issued_date: issuedDate.value,
        expire_date: expireDate.value,
        storage: null,
      };

      const jsonString = JSON.stringify(payload);
      const formData = new FormData();
      formData.append('json', jsonString);

      if (pickedFile) {
        if (pickedFile.file) {
          formData.append('file', pickedFile.file);
        } else {
          formData.append('file', {
            uri: pickedFile.uri,
            name: pickedFile.name,
            type: pickedFile.mimeType ?? 'application/octet-stream',
          } as any);
        }
      }

      const response = await apiFetch('/documents', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
        onUnauthorized: handleUnauthorized,
      });

      const bodyText = await response.text();
      if (!response.ok) {
        throw new Error(
          bodyText ? `Request failed (${response.status}): ${bodyText}` : `Request failed with status ${response.status}`
        );
      }

      let message = 'Document created.';
      try {
        const data = JSON.parse(bodyText) as DocumentDto;
        if (data.id) {
          message = `Document "${data.title ?? title.trim()}" created.`;
        }
      } catch {
        // use default message
      }
      resetForm();
      onDocumentCreated?.(message);
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      showSubmitError(msg);
    } finally {
      setLoading(false);
    }
  };

  const formRef = useRef<View>(null);
  useWebFormEnterSubmit(!loading, () => {
    void handleSubmit();
  }, formRef);

  return (
    <View
      ref={formRef}
      style={styles.container}
      accessibilityLabel="Document create form"
    >
      <FieldLabel label="Title" required style={styles.label} />
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="Document title"
        placeholderTextColor={palette.icon}
        aria-required
      />

      <FieldLabel label="Content" required style={styles.label} />
      <TextInput
        style={[styles.input, styles.inputMultiline]}
        value={content}
        onChangeText={setContent}
        placeholder="Document content"
        placeholderTextColor={palette.icon}
        multiline
        textAlignVertical="top"
        aria-required
      />

      <Text style={styles.label}>Tags (optional, comma-separated)</Text>
      <TextInput
        style={styles.input}
        value={tagsInput}
        onChangeText={setTagsInput}
        placeholder="e.g. work, notes"
        placeholderTextColor={palette.icon}
      />

      <Text style={styles.label}>Issue date (optional)</Text>
      <DatePicker
        value={issuedDateInput}
        onChange={setIssuedDateInput}
        accessibilityLabel="Issue date"
        placeholder="YYYY-MM-DD"
      />

      <Text style={styles.label}>Expire date (optional)</Text>
      <DatePicker
        value={expireDateInput}
        onChange={setExpireDateInput}
        accessibilityLabel="Expire date"
        placeholder="YYYY-MM-DD"
      />

      <Text style={styles.label}>File (optional)</Text>
      {isWeb && protonSupported && !protonSession ? (
        <Text style={styles.hint}>Connect Proton Drive above to attach files on web.</Text>
      ) : null}
      <View style={styles.fileRow}>
        <Button
          variant="secondary"
          label="Choose file"
          onPress={() => void pickFile()}
          disabled={loading || (isWeb && protonSupported && !protonSession)}
          accessibilityLabel="Choose file"
          style={styles.secondaryButton}
          labelStyle={styles.secondaryButtonText}
        />
        {pickedFile ? (
          <>
            <Text style={styles.fileName} numberOfLines={1}>
              {pickedFile.name}
            </Text>
            <TouchableOpacity
              onPress={clearFile}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Clear selected file"
            >
              <Text style={styles.clearLink}>Clear</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.hint}>No file selected</Text>
        )}
      </View>

      {submitError ? (
        <View style={styles.errorBanner}>
          <ManagerFeedbackBanner
            tone="error"
            message={submitError}
            onDismiss={() => setSubmitError(null)}
          />
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button
          label={loading ? 'Submitting…' : 'Submit'}
          onPress={() => void handleSubmit()}
          disabled={loading}
          loading={loading}
          accessibilityLabel={loading ? 'Submitting document' : 'Submit'}
          style={styles.submitButton}
        />
      </View>
    </View>
  );
}
