import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTenantBranding } from '@/lib/tenant/TenantThemeContext';
import DocumentCreateForm from '@/tenants/life-manager/components/document-create-form';
import DocumentList from '@/tenants/life-manager/components/document-list';
import ProtonConnectPanel from '@/tenants/life-manager/components/proton-connect-panel';

/**
 * Document Manager: Proton connect, create, list, preview, and delete.
 *
 * ```
 * User -> DocumentManagerScreen : open Documents menu
 * DocumentManagerScreen -> ProtonConnectPanel : render
 * DocumentManagerScreen -> DocumentCreateForm : render; onDocumentCreated
 * DocumentCreateForm -> API : POST /documents (same as old Home)
 * DocumentCreateForm -> DocumentManagerScreen : bump refreshKey
 * DocumentManagerScreen -> DocumentList : refreshKey
 * DocumentList -> API : GET/PUT/DELETE /documents; Proton preview
 * ```
 */
export default function DocumentManagerScreen() {
  const { assets, headerBackground } = useTenantBranding();
  const [documentsRefreshKey, setDocumentsRefreshKey] = useState(0);

  return (
    <ParallaxScrollView
      headerBackgroundColor={headerBackground}
      headerImage={
        <Image
          source={assets.headerImage}
          style={styles.headerImage}
          contentFit="cover"
        />
      }>
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title" accessibilityRole="header">
          Document Manager
        </ThemedText>
      </ThemedView>

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
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  section: {
    gap: 8,
    marginBottom: 8,
  },
  headerImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
});
