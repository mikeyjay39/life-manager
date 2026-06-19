import { useTenant } from '@/lib/tenant/TenantContext';

export default function HomeTab() {
  const {
    tenant: {
      screens: { Home: HomeScreen },
    },
  } = useTenant();

  return <HomeScreen />;
}
