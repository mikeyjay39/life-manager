import { Redirect } from 'expo-router';

import { useTenant } from '@/lib/tenant/TenantContext';

/**
 * Expo route for Car Manager. Tenants without screens.Car go Home.
 *
 * sequenceDiagram
 *   participant Route as car.tsx
 *   participant Tenant as useTenant
 *   participant Screen as CarScreen
 *   Route->>Tenant: read screens.Car
 *   alt Car screen registered
 *     Route->>Screen: render
 *   else no Car screen
 *     Route-->>Route: Redirect /(tabs)
 *   end
 */
export default function CarTab() {
  const {
    tenant: {
      screens: { Car: CarScreen },
    },
  } = useTenant();

  if (!CarScreen) {
    return <Redirect href="/(tabs)" />;
  }

  return <CarScreen />;
}
