import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ManagerScrollView } from '@/components/ui/manager-scroll-view';
import DocumentCreateForm from '@/tenants/life-manager/components/document-create-form';
import DocumentList from '@/tenants/life-manager/components/document-list';
import ProtonConnectPanel from '@/tenants/life-manager/components/proton-connect-panel';

/**
 * Document Manager: Proton connect, create, list, preview, and delete.
 *
 * ```
 * User -> DocumentManagerScreen : open Documents menu
 * DocumentManagerScreen -> ManagerScrollView : quiet chrome (no parallax)
 * DocumentManagerScreen -> ProtonConnectPanel : render
 * DocumentManagerScreen -> DocumentCreateForm : render; onDocumentCreated
 * DocumentCreateForm -> API : POST /documents (same as old Home)
 * DocumentCreateForm -> DocumentManagerScreen : bump refreshKey
 * DocumentManagerScreen -> DocumentList : refreshKey
 * DocumentList -> API : GET/PUT/DELETE /documents; Proton preview
 * ```
 */
export default function DocumentManagerScreen() {
  const [documentsRefreshKey, setDocumentsRefreshKey] = useState(0);

  return (
    <ManagerScrollView title="Document Manager">
      <ThemedView
        style={styles.section}
        accessibilityLabel="Documents section">
        <ThemedText type="subtitle">Documents</ThemedText>
        <ProtonConnectPanel />
        <DocumentCreateForm
          onDocumentCreated={() => setDocumentsRefreshKey((key) => key + 1)}
        />
        <DocumentList refreshKey={documentsRefreshKey} />
      </ThemedView>
    </ManagerScrollView>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 8,
    marginBottom: 8,
  },
});
