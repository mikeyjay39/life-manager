import { useState } from 'react';

import {
  ManagerFeedbackBanner,
  useManagerFeedback,
} from '@/components/ui/manager-feedback';
import { ManagerScrollView } from '@/components/ui/manager-scroll-view';
import { ManagerSection } from '@/components/ui/manager-section';
import DocumentCreateForm from '@/tenants/life-manager/components/document-create-form';
import DocumentList from '@/tenants/life-manager/components/document-list';
import ProtonConnectPanel from '@/tenants/life-manager/components/proton-connect-panel';

/**
 * Document Manager: Proton connect, create, list, preview, and delete.
 *
 * ```
 * User -> DocumentManagerScreen : open Documents menu
 * DocumentManagerScreen -> ManagerScrollView : quiet chrome (no parallax)
 * DocumentManagerScreen -> ManagerSection : Documents
 * DocumentManagerScreen -> ProtonConnectPanel : render
 * DocumentManagerScreen -> DocumentCreateForm : render; onDocumentCreated
 * DocumentCreateForm -> API : POST /documents (same as old Home)
 * DocumentCreateForm -> DocumentManagerScreen : bump refreshKey; showSuccess
 * DocumentManagerScreen -> DocumentList : refreshKey
 * DocumentList -> API : GET/PUT/DELETE /documents; Proton preview
 * ```
 */
export default function DocumentManagerScreen() {
  const [documentsRefreshKey, setDocumentsRefreshKey] = useState(0);
  const { feedback, showSuccess, dismiss } = useManagerFeedback();

  return (
    <ManagerScrollView title="Document Manager">
      <ManagerSection title="Documents" accessibilityLabel="Documents section">
        <ProtonConnectPanel />
        {feedback ? (
          <ManagerFeedbackBanner
            tone={feedback.tone}
            message={feedback.message}
            onDismiss={dismiss}
          />
        ) : null}
        <DocumentCreateForm
          onDocumentCreated={(successMessage) => {
            setDocumentsRefreshKey((key) => key + 1);
            showSuccess(successMessage);
          }}
        />
        <DocumentList refreshKey={documentsRefreshKey} />
      </ManagerSection>
    </ManagerScrollView>
  );
}
