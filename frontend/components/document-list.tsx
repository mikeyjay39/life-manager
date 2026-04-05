import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { authenticatedFetch } from '@/lib/api/client';

type DocumentRow = {
  id: string;
  title: string;
  content: string;
};

export default function DocumentList() {
  const { token, handleUnauthorized } = useAuth();
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<DocumentRow | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setDocuments([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await authenticatedFetch('/api/v1/documents', {
        method: 'GET',
        token,
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
      const data = JSON.parse(bodyText) as unknown;
      if (!Array.isArray(data)) {
        throw new Error('Invalid response: expected a list of documents.');
      }
      const rows: DocumentRow[] = data.map((item) => {
        const d = item as Record<string, unknown>;
        return {
          id: String(d.id ?? ''),
          title: String(d.title ?? ''),
          content: String(d.content ?? ''),
        };
      });
      setDocuments(rows);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to load documents');
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [token, handleUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Your documents</Text>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={() => void load()}
          disabled={loading || !token}
        >
          <Text style={styles.refreshButtonText}>{loading ? 'Loading…' : 'Refresh'}</Text>
        </TouchableOpacity>
      </View>

      {!token ? (
        <Text style={styles.hint}>Sign in to see your documents.</Text>
      ) : loading && documents.length === 0 ? (
        <ActivityIndicator size="small" />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : documents.length === 0 ? (
        <Text style={styles.hint}>No documents yet.</Text>
      ) : (
        documents.map((doc) => (
          <TouchableOpacity
            key={doc.id}
            style={styles.row}
            onPress={() => setSelected(doc)}
            accessibilityRole="button"
            accessibilityLabel={`Open document ${doc.title}`}
          >
            <Text style={styles.rowTitle} numberOfLines={2}>
              {doc.title || '(Untitled)'}
            </Text>
          </TouchableOpacity>
        ))
      )}

      <Modal
        visible={selected !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setSelected(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView style={styles.modalScroll}>
              <Text style={styles.modalTitle}>{selected?.title ?? ''}</Text>
              <Text style={styles.modalContent}>{selected?.content ?? ''}</Text>
            </ScrollView>
            <TouchableOpacity style={styles.modalClose} onPress={() => setSelected(null)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
    marginTop: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  refreshButton: {
    backgroundColor: '#e8e8e8',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  refreshButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  row: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 4,
  },
  rowTitle: {
    fontSize: 16,
    color: '#111',
  },
  hint: {
    fontSize: 14,
    color: '#888',
  },
  errorText: {
    fontSize: 14,
    color: '#c00',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  modalScroll: {
    padding: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    color: '#111',
  },
  modalContent: {
    fontSize: 16,
    lineHeight: 22,
    color: '#333',
  },
  modalClose: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ccc',
    padding: 14,
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
  },
  modalCloseText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0a7ea4',
  },
});
