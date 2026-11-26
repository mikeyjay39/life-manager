import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  ManagerFeedbackBanner,
  type ManagerFeedbackState,
} from '@/components/ui/manager-feedback';
import { useWebFormEnterSubmit } from '@/components/ui/web-form-enter-submit';
import { useAuth } from '@/contexts/AuthContext';
import { useProtonConnect } from '@/contexts/ProtonConnectContext';
import { apiFetch } from '@/lib/api/client';
import type {
  CreateDocumentCommand,
  DocumentDto,
  DocumentStorageRefDto,
  ExtractedDocumentFieldsDto,
  ExtractionLimitsDto,
} from '@/lib/api/types';
import { useColorPalette } from '@/lib/tenant/TenantThemeContext';
import {
  buildCreateDocumentCommand,
  extractionBannerMessage,
  mergeExtractedFields,
  parseCreatedDocumentResponse,
  parseExtractedFields,
  parseExtractionLimits,
  readApiErrorMessage,
  storageRefFromProtonUpload,
  type DocumentFormInput,
} from './document-create-form-utils';

const EXTRACT_FILE_TYPES = ['image/*', 'application/pdf'];
const BYTES_PER_MEGABYTE = 1024 * 1024;

function appendPickedFile(formData: FormData, asset: DocumentPickerAsset) {
  if (asset.file) {
    formData.append('file', asset.file);
    return;
  }
  formData.append('file', {
    uri: asset.uri,
    name: asset.name,
    type: asset.mimeType ?? 'application/octet-stream',
  } as any);
}

function fileTooLargeMessage(
  asset: DocumentPickerAsset,
  limits: ExtractionLimitsDto | null
): string | null {
  const size = asset.size ?? asset.file?.size;
  if (!limits || size == null || size <= limits.max_file_bytes) {
    return null;
  }
  const maxMegabytes = Number((limits.max_file_bytes / BYTES_PER_MEGABYTE).toFixed(1));
  return `${asset.name} is larger than ${maxMegabytes} MB.`;
}

function extractionLimitsHint(limits: ExtractionLimitsDto | null): string | null {
  if (!limits) {
    return null;
  }
  if (limits.remaining_today === 0) {
    return 'No extractions left today';
  }
  return `${limits.remaining_today} of ${limits.daily_limit_per_user} extractions left today`;
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

type DocumentCreateFormBaseProps = {
  /** Lets the parent block Cancel while a create request is in flight. */
  onSubmittingChange?: (submitting: boolean) => void;
  /** Editable starting title (for example Car label + role). */
  initialTitle?: string;
  /** Editable starting tags string (comma-separated). */
  initialTags?: string;
};

type DocumentCreateFormModeProps =
  | {
      /** Create mode: fires after POST /documents with the created DocumentDto. */
      onDocumentCreated?: (document: DocumentDto) => void;
      onDraft?: never;
    }
  | {
      /**
       * Draft mode: the form does not POST /documents. It gives the payload to
       * the parent, which sends it inside its own write. The form stays busy
       * until the returned promise settles. Reject with an Error to keep the
       * form open: it shows the message, keeps its values, and the next Submit
       * reuses the uploaded Proton file.
       */
      onDraft: (draft: CreateDocumentCommand) => void | Promise<void>;
      onDocumentCreated?: never;
    };

type DocumentCreateFormProps = DocumentCreateFormBaseProps & DocumentCreateFormModeProps;

type UploadedProtonFile = {
  asset: DocumentPickerAsset;
  storage: DocumentStorageRefDto;
};

const DRAFT_FILE_HINT = 'To attach a file, connect Proton Drive on web.';

async function readResponseOrThrow(response: Response): Promise<string> {
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(
      bodyText
        ? `Request failed (${response.status}): ${bodyText}`
        : `Request failed with status ${response.status}`
    );
  }
  return bodyText;
}

/**
 * Inline create-document fields for ManagerFormVsResults and Car Manager modals.
 * Parent owns Add / Cancel expand state; this form owns Submit.
 *
 * Submit:
 * ```
 * [*] --> clear submitError
 *     --> validate fields
 *         | invalid --> showSubmitError (inline banner) --> [*]
 *         | valid, web + Proton + file --> upload to Proton (reuse an earlier upload of the same file)
 *         | valid --> mode?
 *             | draft --> onDraft(CreateDocumentCommand); no POST /documents
 *                 | rejects --> showSubmitError; keep values and upload --> [*]
 *                 | resolves --> reset form --> [*]
 *             | create --> POST (Proton JSON or multipart)
 *                 | fail --> showSubmitError; keep form open --> [*]
 *                 | ok, body invalid --> showSubmitError; no parent callback --> [*]
 *                 | ok, body valid --> clear error; onDocumentCreated(DocumentDto) --> [*]
 *     | unmounted mid-request --> skip setState and parent callback --> [*]
 * ```
 *
 * Extract From File (create and draft mode; GET /documents/extract/limits on mount):
 * ```
 * [*] --> Extract From File (busy guard; disabled when remaining_today = 0)
 *     --> pick image or PDF | cancel --> [*]
 *     --> size > max_file_bytes --> error banner --> [*]
 *     --> POST /documents/extract (Submit disabled; fields editable)
 *         | unmounted --> ignore --> [*]
 *         | error --> error banner; keep values --> refresh limits --> [*]
 *         | 200 --> mergeExtractedFields (empty fields only) --> banner --> refresh limits --> [*]
 * ```
 * The extract file is not the attached file: `pickedFile` does not change.
 *
 * Draft mode has no device-file multipart upload, so it offers an attached
 * file only on web with a Proton session.
 */
export default function DocumentCreateForm({
  onDocumentCreated,
  onDraft,
  onSubmittingChange,
  initialTitle = '',
  initialTags = '',
}: DocumentCreateFormProps) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState('');
  const [tagsInput, setTagsInput] = useState(initialTags);
  const [issuedDateInput, setIssuedDateInput] = useState('');
  const [expireDateInput, setExpireDateInput] = useState('');
  const [pickedFile, setPickedFile] = useState<DocumentPickerAsset | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractionLimits, setExtractionLimits] = useState<ExtractionLimitsDto | null>(null);
  const [extractFeedback, setExtractFeedback] = useState<ManagerFeedbackState>(null);
  const { token, handleUnauthorized } = useAuth();
  const { session: protonSession, isSupported: protonSupported } = useProtonConnect();
  const palette = useColorPalette();
  const isWeb = Platform.OS === 'web';
  const mountedRef = useRef(true);
  const uploadedProtonFileRef = useRef<UploadedProtonFile | null>(null);
  const extractingRef = useRef(false);
  const formValuesRef = useRef<DocumentFormInput>({
    title,
    content,
    tagsInput,
    issuedDateInput,
    expireDateInput,
  });
  const isDraftMode = onDraft != null;
  const canAttachFile = !isDraftMode || (isWeb && protonSession != null);
  const noExtractionsLeft = extractionLimits?.remaining_today === 0;

  // The extract merge runs after an await, so it reads the latest values here
  // and keeps edits that the user made while the request ran.
  useEffect(() => {
    formValuesRef.current = { title, content, tagsInput, issuedDateInput, expireDateInput };
  }, [title, content, tagsInput, issuedDateInput, expireDateInput]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    onSubmittingChange?.(loading);
  }, [loading, onSubmittingChange]);

  const loadExtractionLimits = useCallback(async () => {
    if (!token) {
      return;
    }
    try {
      const response = await apiFetch('/documents/extract/limits', {
        headers: { Authorization: `Bearer ${token}` },
        onUnauthorized: handleUnauthorized,
      });
      const bodyText = await response.text();
      if (!mountedRef.current) {
        return;
      }
      const limits = response.ok ? parseExtractionLimits(bodyText) : null;
      if (!limits) {
        console.warn(`Extraction limits unavailable (status ${response.status}).`);
      }
      setExtractionLimits(limits);
    } catch (err: unknown) {
      // The backend still enforces the limits, so the button stays enabled.
      console.warn('Extraction limits request failed.', err);
      if (mountedRef.current) {
        setExtractionLimits(null);
      }
    }
  }, [token, handleUnauthorized]);

  useEffect(() => {
    void loadExtractionLimits();
  }, [loadExtractionLimits]);

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
        extractRow: {
          flexDirection: 'row',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
        },
        extractFeedback: {
          marginBottom: 8,
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
    uploadedProtonFileRef.current = null;
    setSubmitError(null);
    setExtractFeedback(null);
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

  const finishCreateSuccess = (bodyText: string) => {
    if (!mountedRef.current) {
      return;
    }
    const created = parseCreatedDocumentResponse(bodyText);
    if (!created) {
      showSubmitError(
        'Document may have been created, but the response could not be read. Refresh the list and try again if needed.'
      );
      return;
    }
    resetForm();
    onDocumentCreated?.(created);
  };

  const uploadPickedFileToProton = async (
    asset: DocumentPickerAsset
  ): Promise<DocumentStorageRefDto> => {
    const uploaded = uploadedProtonFileRef.current;
    if (uploaded?.asset === asset) {
      return uploaded.storage;
    }
    const proton = await import('@/lib/proton-drive/load-proton.web');
    const file = await assetToFile(asset);
    const upload = await proton.uploadToLifeManagerFolder(file, undefined, asset.name);
    const storage = storageRefFromProtonUpload(upload);
    uploadedProtonFileRef.current = { asset, storage };
    return storage;
  };

  const submitDraft = async (
    command: CreateDocumentCommand,
    sendDraft: (draft: CreateDocumentCommand) => void | Promise<void>
  ) => {
    const storage =
      isWeb && pickedFile && protonSession
        ? await uploadPickedFileToProton(pickedFile)
        : null;
    await sendDraft({ ...command, storage });
    if (!mountedRef.current) {
      return;
    }
    resetForm();
  };

  const submitProtonCreate = async (
    command: CreateDocumentCommand,
    authToken: string,
    asset: DocumentPickerAsset
  ) => {
    const storage = await uploadPickedFileToProton(asset);
    const response = await apiFetch('/documents/json', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...command, storage }),
      onUnauthorized: handleUnauthorized,
    });
    finishCreateSuccess(await readResponseOrThrow(response));
  };

  const submitMultipartCreate = async (
    command: CreateDocumentCommand,
    authToken: string
  ) => {
    const formData = new FormData();
    formData.append('json', JSON.stringify(command));

    if (pickedFile) {
      appendPickedFile(formData, pickedFile);
    }

    const response = await apiFetch('/documents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      body: formData,
      onUnauthorized: handleUnauthorized,
    });
    finishCreateSuccess(await readResponseOrThrow(response));
  };

  const pickExtractFile = async (): Promise<DocumentPickerAsset | null> => {
    const result = await DocumentPicker.getDocumentAsync({
      type: EXTRACT_FILE_TYPES,
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.length) {
      return null;
    }
    return result.assets[0];
  };

  const applyExtractedFields = (
    fields: ExtractedDocumentFieldsDto,
    fileName: string
  ) => {
    const current = formValuesRef.current;
    const { next, filledCount } = mergeExtractedFields(current, fields, initialTags);
    setTitle(next.title);
    setContent(next.content);
    setTagsInput(next.tagsInput);
    setIssuedDateInput(next.issuedDateInput);
    setExpireDateInput(next.expireDateInput);
    formValuesRef.current = next;
    setExtractFeedback({
      tone: 'success',
      message: extractionBannerMessage(fileName, filledCount),
    });
  };

  const sendExtractRequest = async (asset: DocumentPickerAsset, authToken: string) => {
    const formData = new FormData();
    appendPickedFile(formData, asset);
    const response = await apiFetch('/documents/extract', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: formData,
      onUnauthorized: handleUnauthorized,
    });
    const bodyText = await response.text();
    if (!mountedRef.current) {
      return;
    }
    if (!response.ok) {
      setExtractFeedback({ tone: 'error', message: readApiErrorMessage(bodyText, response.status) });
      return;
    }
    const fields = parseExtractedFields(bodyText);
    if (!fields) {
      setExtractFeedback({ tone: 'error', message: 'The extraction response could not be read.' });
      return;
    }
    applyExtractedFields(fields, asset.name);
  };

  const runExtraction = async (authToken: string) => {
    const asset = await pickExtractFile();
    if (!asset || !mountedRef.current) {
      return;
    }
    const tooLarge = fileTooLargeMessage(asset, extractionLimits);
    if (tooLarge) {
      setExtractFeedback({ tone: 'error', message: tooLarge });
      return;
    }
    setExtracting(true);
    try {
      await sendExtractRequest(asset, authToken);
    } catch (err: unknown) {
      console.error(err);
      if (mountedRef.current) {
        const message = err instanceof Error ? err.message : 'Something went wrong';
        setExtractFeedback({ tone: 'error', message });
      }
    } finally {
      if (mountedRef.current) {
        setExtracting(false);
        void loadExtractionLimits();
      }
    }
  };

  const handleExtract = async () => {
    // The ref blocks a second click before the `extracting` state renders.
    if (extractingRef.current || loading) {
      return;
    }
    extractingRef.current = true;
    setExtractFeedback(null);
    try {
      if (!token) {
        setExtractFeedback({ tone: 'error', message: 'No authentication token available.' });
        return;
      }
      await runExtraction(token);
    } finally {
      extractingRef.current = false;
    }
  };

  const handleSubmit = async () => {
    if (loading || extracting) {
      return;
    }
    setSubmitError(null);

    if (!token) {
      showSubmitError('No authentication token available.');
      return;
    }

    const built = buildCreateDocumentCommand({
      title,
      content,
      tagsInput,
      issuedDateInput,
      expireDateInput,
    });
    if (!built.ok) {
      showSubmitError(built.message);
      return;
    }

    if (isWeb && pickedFile && !protonSession) {
      showSubmitError('Connect Proton Drive before uploading a file on web.');
      return;
    }

    setLoading(true);
    try {
      if (onDraft) {
        await submitDraft(built.value, onDraft);
      } else if (isWeb && pickedFile && protonSession) {
        await submitProtonCreate(built.value, token, pickedFile);
      } else {
        await submitMultipartCreate(built.value, token);
      }
    } catch (err: unknown) {
      console.error(err);
      if (!mountedRef.current) {
        return;
      }
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      showSubmitError(msg);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  };

  const fileHint = isDraftMode && !canAttachFile
    ? DRAFT_FILE_HINT
    : isWeb && protonSupported && !protonSession
      ? 'Connect Proton Drive above to attach files on web.'
      : null;

  const formRef = useRef<View>(null);
  const extractHint = extractionLimitsHint(extractionLimits);

  useWebFormEnterSubmit(!loading && !extracting, () => {
    void handleSubmit();
  }, formRef);

  return (
    <View
      ref={formRef}
      style={styles.container}
      accessibilityLabel="Document create form"
    >
      <View style={styles.extractRow}>
        <Button
          variant="secondary"
          label={extracting ? 'Extracting…' : 'Extract From File'}
          onPress={() => void handleExtract()}
          disabled={extracting || loading || noExtractionsLeft}
          loading={extracting}
          accessibilityLabel="Extract From File"
          style={styles.secondaryButton}
          labelStyle={styles.secondaryButtonText}
        />
        {extractHint ? <Text style={styles.hint}>{extractHint}</Text> : null}
      </View>
      {extractFeedback ? (
        <View style={styles.extractFeedback}>
          <ManagerFeedbackBanner
            tone={extractFeedback.tone}
            message={extractFeedback.message}
            onDismiss={() => setExtractFeedback(null)}
            testID={`extract-feedback-${extractFeedback.tone}`}
          />
        </View>
      ) : null}

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
      {fileHint ? <Text style={styles.hint}>{fileHint}</Text> : null}
      {canAttachFile ? (
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
      ) : null}

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
          disabled={loading || extracting}
          loading={loading}
          accessibilityLabel={loading ? 'Submitting document' : 'Submit'}
          style={styles.submitButton}
        />
      </View>
    </View>
  );
}
