import React, { useState } from 'react';
import { View, TextInput, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api/client';

function parseTags(input: string): string[] {
  return input
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export default function DocumentCreateForm() {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [pickedFile, setPickedFile] = useState<DocumentPickerAsset | null>(null);
  const [loading, setLoading] = useState(false);
  const { token, handleUnauthorized } = useAuth();

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
    if (!token) {
      Alert.alert('Error', 'No authentication token available.');
      return;
    }
    if (!title.trim() || !content.trim()) {
      Alert.alert('Error', 'Please enter a title and content.');
      return;
    }

    const tags = parseTags(tagsInput);
    const payload: Record<string, unknown> = {
      title: title.trim(),
      content: content.trim(),
    };
    if (tags.length > 0) {
      payload.tags = tags;
    }

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

    setLoading(true);
    try {
      const response = await apiFetch('/api/v1/documents', {
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

      let message = 'Document created successfully.';
      try {
        const data = JSON.parse(bodyText) as { id?: string; title?: string };
        if (data.id) {
          message = `Created document "${data.title ?? title.trim()}" (${data.id}).`;
        }
      } catch {
        // use default message
      }
      Alert.alert('Success', message);
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Title</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="Document title"
      />

      <Text style={styles.label}>Content</Text>
      <TextInput
        style={[styles.input, styles.inputMultiline]}
        value={content}
        onChangeText={setContent}
        placeholder="Document content"
        multiline
        textAlignVertical="top"
      />

      <Text style={styles.label}>Tags (optional, comma-separated)</Text>
      <TextInput
        style={styles.input}
        value={tagsInput}
        onChangeText={setTagsInput}
        placeholder="e.g. work, notes"
      />

      <Text style={styles.label}>File (optional)</Text>
      <View style={styles.fileRow}>
        <TouchableOpacity style={styles.secondaryButton} onPress={pickFile} disabled={loading}>
          <Text style={styles.secondaryButtonText}>Choose file</Text>
        </TouchableOpacity>
        {pickedFile ? (
          <>
            <Text style={styles.fileName} numberOfLines={1}>
              {pickedFile.name}
            </Text>
            <TouchableOpacity onPress={clearFile} disabled={loading}>
              <Text style={styles.clearLink}>Clear</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.hint}>No file selected</Text>
        )}
      </View>

      <TouchableOpacity
        style={[styles.submitButton, loading && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        <Text style={styles.submitButtonText}>{loading ? 'Submitting…' : 'Create document'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
    marginTop: 8,
  },
  label: {
    fontSize: 16,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
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
    backgroundColor: '#e8e8e8',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  fileName: {
    flex: 1,
    minWidth: 80,
    fontSize: 14,
    color: '#444',
  },
  hint: {
    fontSize: 14,
    color: '#888',
  },
  clearLink: {
    fontSize: 14,
    color: '#0a7ea4',
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#0a7ea4',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
