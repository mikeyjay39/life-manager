import { Redirect } from 'expo-router';

import { useTenant } from '@/lib/tenant/TenantContext';

/**
 * Expo route for Health Manager. Tenants without screens.Health go Home.
 *
 * sequenceDiagram
 *   participant Route as health.tsx
 *   participant Tenant as useTenant
 *   participant Screen as HealthScreen
 *   Route->>Tenant: read screens.Health
 *   alt Health screen registered
 *     Route->>Screen: render
 *   else no Health screen
 *     Route-->>Route: Redirect /(tabs)
 *   end
 */
export default function HealthTab() {
  const {
    tenant: {
      screens: { Health: HealthScreen },
    },
  } = useTenant();

  if (!HealthScreen) {
    return <Redirect href="/(tabs)" />;
  }

  return <HealthScreen />;
}
