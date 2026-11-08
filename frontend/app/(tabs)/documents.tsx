import { Redirect } from 'expo-router';

import { useTenant } from '@/lib/tenant/TenantContext';

/**
 * Expo route for Document Manager. Tenants without screens.Documents go Home.
 *
 * sequenceDiagram
 *   participant Route as documents.tsx
 *   participant Tenant as useTenant
 *   participant Screen as DocumentManagerScreen
 *   Route->>Tenant: read screens.Documents
 *   alt Documents screen registered
 *     Route->>Screen: render
 *   else no Documents screen
 *     Route-->>Route: Redirect /(tabs)
 *   end
 */
export default function DocumentsTab() {
  const {
    tenant: {
      screens: { Documents: DocumentsScreen },
    },
  } = useTenant();

  if (!DocumentsScreen) {
    return <Redirect href="/(tabs)" />;
  }

  return <DocumentsScreen />;
}
