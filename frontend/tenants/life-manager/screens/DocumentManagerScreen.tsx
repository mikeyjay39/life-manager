import { useCallback, useRef, useState } from 'react';

import { ManagerScrollView } from '@/components/ui/manager-scroll-view';
import { ManagerSection } from '@/components/ui/manager-section';
import DocumentCreateForm, {
  type DocumentCreateFormHandle,
} from '@/tenants/life-manager/components/document-create-form';
import DocumentList from '@/tenants/life-manager/components/document-list';
import ProtonConnectPanel from '@/tenants/life-manager/components/proton-connect-panel';

/**
 * Document Manager: Proton connect, create, list, preview, and delete.
 *
 * ```
 * User -> DocumentManagerScreen : open Documents menu
 * DocumentManagerScreen -> ManagerScrollView : quiet chrome (no parallax)
 * DocumentManagerScreen -> ManagerSection : title + Create + Refresh toolbar
 * DocumentManagerScreen -> ProtonConnectPanel : render
 * DocumentManagerScreen -> DocumentCreateForm : hideTrigger; open via section Add
 * DocumentCreateForm -> API : POST /documents
 * DocumentCreateForm -> DocumentManagerScreen : bump refreshKey
 * DocumentManagerScreen -> DocumentList : refreshKey; showToolbar false
 * DocumentList -> API : GET/PUT/DELETE /documents; Proton preview
 * ```
 */
export default function DocumentManagerScreen() {
  const [documentsRefreshKey, setDocumentsRefreshKey] = useState(0);
  const createFormRef = useRef<DocumentCreateFormHandle>(null);

  const bumpDocumentsRefresh = useCallback(() => {
    setDocumentsRefreshKey((key) => key + 1);
  }, []);

  return (
    <ManagerScrollView title="Document Manager">
      <ManagerSection
        title="Documents"
        accessibilityLabel="Documents section"
        primaryAction={{
          label: 'Create document',
          onPress: () => createFormRef.current?.open(),
          accessibilityLabel: 'Create document',
        }}
        secondaryActions={[
          {
            label: 'Refresh',
            onPress: bumpDocumentsRefresh,
            accessibilityLabel: 'Refresh documents',
          },
        ]}
      >
        <ProtonConnectPanel />
        <DocumentCreateForm
          ref={createFormRef}
          hideTrigger
          onDocumentCreated={bumpDocumentsRefresh}
        />
        <DocumentList refreshKey={documentsRefreshKey} showToolbar={false} />
      </ManagerSection>
    </ManagerScrollView>
  );
}
