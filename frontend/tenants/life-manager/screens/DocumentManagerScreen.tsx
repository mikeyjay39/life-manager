import { useCallback, useState } from 'react';

import {
  ManagerFeedbackBanner,
  useManagerFeedback,
} from '@/components/ui/manager-feedback';
import {
  ManagerFormVsResults,
  type ManagerFormMode,
} from '@/components/ui/manager-form-vs-results';
import { ManagerScrollView } from '@/components/ui/manager-scroll-view';
import { ManagerSection } from '@/components/ui/manager-section';
import DocumentCreateForm from '@/tenants/life-manager/components/document-create-form';
import DocumentList from '@/tenants/life-manager/components/document-list';
import ProtonConnectPanel from '@/tenants/life-manager/components/proton-connect-panel';

/**
 * Document Manager: Proton setup, create on demand, and document list.
 *
 * ```
 * User -> DocumentManagerScreen : open Documents menu
 * DocumentManagerScreen -> ManagerScrollView : quiet chrome (no parallax)
 * DocumentManagerScreen -> ManagerSection : Proton setup (distinct)
 * DocumentManagerScreen -> ManagerSection : Create document (form-vs-results)
 * DocumentManagerScreen -> ManagerFormVsResults : collapsed until Add document
 * DocumentManagerScreen -> DocumentCreateForm : inline fields when expanded
 * DocumentCreateForm -> API : POST /documents (multipart or Proton JSON)
 * DocumentCreateForm -> DocumentManagerScreen : collapse + bump refreshKey; showSuccess
 * DocumentManagerScreen -> ManagerSection : Documents list + Refresh
 * DocumentManagerScreen -> DocumentList : refreshKey; showToolbar false
 * DocumentList -> DocumentManagerScreen : onLoadingChange (disable Refresh)
 * DocumentList -> API : GET/PUT/DELETE /documents; Proton preview
 * ```
 */
export default function DocumentManagerScreen() {
  const [documentsRefreshKey, setDocumentsRefreshKey] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [createMode, setCreateMode] = useState<ManagerFormMode>('collapsed');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const { feedback, showSuccess, dismiss } = useManagerFeedback();

  const bumpDocumentsRefresh = useCallback(() => {
    setDocumentsRefreshKey((key) => key + 1);
  }, []);

  const handleDocumentCreated = useCallback(
    (successMessage: string) => {
      setCreateMode('collapsed');
      bumpDocumentsRefresh();
      showSuccess(successMessage);
    },
    [bumpDocumentsRefresh, showSuccess]
  );

  return (
    <ManagerScrollView title="Document Manager">
      <ManagerSection
        title="Proton Drive"
        accessibilityLabel="Proton setup section"
      >
        <ProtonConnectPanel />
      </ManagerSection>

      <ManagerSection
        title="Create document"
        accessibilityLabel="Create document section"
      >
        {feedback ? (
          <ManagerFeedbackBanner
            tone={feedback.tone}
            message={feedback.message}
            onDismiss={dismiss}
          />
        ) : null}
        <ManagerFormVsResults
          // Create-only region: keep Add (not empty-state copy) when collapsed.
          itemCount={1}
          addLabel="Add document"
          emptyMessage="No documents yet."
          addAccessibilityLabel="Add document"
          mode={createMode}
          onModeChange={setCreateMode}
          onCancel={() => {
            if (createSubmitting) {
              return false;
            }
          }}
          form={
            <DocumentCreateForm
              onDocumentCreated={handleDocumentCreated}
              onSubmittingChange={setCreateSubmitting}
            />
          }
          testID="document-create-form-vs-results"
        />
      </ManagerSection>

      <ManagerSection
        title="Documents"
        accessibilityLabel="Document list section"
        secondaryActions={[
          {
            label: listLoading ? 'Loading…' : 'Refresh',
            onPress: bumpDocumentsRefresh,
            disabled: listLoading,
            accessibilityLabel: listLoading
              ? 'Loading documents'
              : 'Refresh documents',
          },
        ]}
      >
        <DocumentList
          refreshKey={documentsRefreshKey}
          showToolbar={false}
          onLoadingChange={setListLoading}
        />
      </ManagerSection>
    </ManagerScrollView>
  );
}
