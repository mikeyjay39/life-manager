import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { ManagerFeedbackBanner } from '@/components/ui/manager-feedback';
import { MANAGER_CONTENT_MAX_WIDTH, MANAGER_SECTION_PADDING } from '@/components/ui/manager-layout';
import { ManagerListSkeleton } from '@/components/ui/manager-list-skeleton';
import { TextInput } from '@/components/ui/text-input';
import { webFocusRingStyle } from '@/components/ui/web-focus-ring';
import { useWebEscapeClose } from '@/hooks/use-web-escape-close';
import type { DocumentDto } from '@/lib/api/types';
import { formatDisplayDate } from '@/lib/format/display';
import { useColorPalette } from '@/lib/tenant/TenantThemeContext';

export type DocumentPickerModalProps = {
  visible: boolean;
  title?: string;
  /** The parent supplies only the current user's authorized Documents. */
  documents: DocumentDto[];
  selectedDocumentId: string | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onSelect: (document: DocumentDto) => void;
  onClose: () => void;
};

/**
 * Parent -> Modal : open with authorized Documents and current link
 * User -> Modal : search, then stage a Document
 * alt Select document
 *   Modal -> Parent : onSelect(DocumentDto)
 * else Cancel / Close / Escape / native back
 *   Modal -> Parent : onClose(), no selection change
 * end
 * Each open mounts a new session so cancelled search and choice are discarded.
 */
export default function DocumentPickerModal(props: DocumentPickerModalProps) {
  return props.visible ? <DocumentPickerSession {...props} /> : null;
}

function DocumentPickerSession({
  title = 'Choose document',
  documents,
  selectedDocumentId,
  loading = false,
  error = null,
  onRetry,
  onSelect,
  onClose,
}: DocumentPickerModalProps) {
  const palette = useColorPalette();
  const [query, setQuery] = useState('');
  const [draftId, setDraftId] = useState(selectedDocumentId);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  useWebEscapeClose(true, onClose);

  const styles = useMemo(() => StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: MANAGER_SECTION_PADDING,
    },
    card: {
      width: '100%',
      maxWidth: MANAGER_CONTENT_MAX_WIDTH,
      maxHeight: '90%',
      padding: MANAGER_SECTION_PADDING,
      gap: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
    },
    row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
    heading: { flex: 1 },
    input: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 8,
      padding: 10,
      color: palette.text,
      backgroundColor: palette.background,
    },
    list: { flexShrink: 1 },
    listContent: { gap: 8 },
    document: { gap: 4, padding: 8, borderWidth: 1, borderColor: palette.border, borderRadius: 8 },
    selected: { borderColor: palette.tint, borderWidth: 2 },
    choice: { padding: 8, minHeight: 44, justifyContent: 'center', borderRadius: 8 },
    meta: { color: palette.muted },
  }), [palette]);

  const search = query.trim().toLocaleLowerCase();
  const filtered = documents.filter((document) =>
    `${document.title} ${document.storage?.filename ?? ''}`.toLocaleLowerCase().includes(search)
  );
  const draft = documents.find((document) => document.id === draftId);

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} accessibilityViewIsModal>
      <View style={styles.backdrop}>
        <View style={styles.card} role="dialog" accessibilityLabel={title} accessibilityViewIsModal>
          <View style={styles.row}>
            <ThemedText type="sectionTitle" style={styles.heading}>{title}</ThemedText>
            <Button label="Close" variant="outline" accessibilityLabel="Close document picker" onPress={onClose} />
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by document name or filename"
            accessibilityLabel="Search documents"
            style={styles.input}
            autoCapitalize="none"
          />
          {loading ? (
            <ManagerListSkeleton accessibilityLabel="Loading documents" />
          ) : error ? (
            <View style={styles.listContent}>
              <ManagerFeedbackBanner tone="error" message={error} />
              {onRetry ? <Button label="Retry" accessibilityLabel="Retry loading documents" onPress={onRetry} /> : null}
            </View>
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
              {filtered.length === 0 ? (
                <ThemedText>{documents.length === 0 ? 'No documents yet. Create a document to link it.' : 'No matching documents.'}</ThemedText>
              ) : filtered.map((document) => (
                <View key={document.id} style={[styles.document, draftId === document.id && styles.selected]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Choose document ${document.title}`}
                    accessibilityState={{ selected: draftId === document.id }}
                    onPress={() => setDraftId(document.id)}
                    onFocus={() => setFocusedId(document.id)}
                    onBlur={() => setFocusedId(null)}
                    style={[styles.choice, webFocusRingStyle(focusedId === document.id, palette.tint)]}>
                    <ThemedText>{document.title}</ThemedText>
                  </Pressable>
                  {document.id === selectedDocumentId ? <ThemedText type="meta">Current selection</ThemedText> : null}
                  {draftId === document.id ? <ThemedText type="meta">Selected</ThemedText> : null}
                  {document.storage?.filename ? <ThemedText type="meta" style={styles.meta}>{document.storage.filename}</ThemedText> : null}
                  {document.storage?.mime_type ? <ThemedText type="meta" style={styles.meta}>File type: {document.storage.mime_type}</ThemedText> : null}
                  <ThemedText type="meta" style={styles.meta}>Created: {formatDisplayDate(document.created_at)}</ThemedText>
                  {document.issued_date ? <ThemedText type="meta" style={styles.meta}>Issued: {formatDisplayDate(document.issued_date)}</ThemedText> : null}
                  {document.expire_date ? <ThemedText type="meta" style={styles.meta}>Expires: {formatDisplayDate(document.expire_date)}</ThemedText> : null}
                </View>
              ))}
            </ScrollView>
          )}
          <View style={styles.row}>
            <Button label="Cancel" variant="outline" accessibilityLabel="Cancel document selection" onPress={onClose} />
            <Button
              label="Select document"
              disabled={loading || error != null || !draft}
              onPress={() => { if (!loading && !error && draft) onSelect(draft); }}
              accessibilityLabel="Select document"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
