import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';

import { configureApiClient } from '@/lib/api/client';
import { getTenantById } from '@/lib/tenant/modules';
import { resolveTenantFromRuntime } from '@/lib/tenant/resolve';
import type { TenantModule, TenantResolution } from '@/lib/tenant/types';
import { UnknownTenantScreen } from '@/lib/tenant/unknown-tenant-screen';

type TenantContextValue = {
  tenant: TenantModule;
  resolution: TenantResolution;
};

type TenantProviderState =
  | { status: 'loading' }
  | { status: 'unknown'; hostname?: string }
  | { status: 'ready'; value: TenantContextValue };

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

type TenantProviderProps = {
  children: ReactNode;
};

export function TenantProvider({ children }: TenantProviderProps) {
  const [state, setState] = useState<TenantProviderState>({ status: 'loading' });

  useEffect(() => {
    const resolution = resolveTenantFromRuntime();
    if (!resolution) {
      setState({
        status: 'unknown',
        hostname:
          Platform.OS === 'web' && typeof window !== 'undefined'
            ? window.location.hostname
            : undefined,
      });
      return;
    }

    const tenant = getTenantById(resolution.tenantId);
    if (!tenant) {
      setState({ status: 'unknown' });
      return;
    }

    configureApiClient({ apiV1Prefix: tenant.apiV1Prefix });
    setState({ status: 'ready', value: { tenant, resolution } });
  }, []);

  if (state.status === 'loading') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (state.status === 'unknown') {
    return <UnknownTenantScreen hostname={state.hostname} />;
  }

  return <TenantContext.Provider value={state.value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantContextValue {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
}

/** Test helper: wrap components with a fixed tenant module. */
export function TenantTestProvider({
  tenant,
  children,
}: {
  tenant: TenantModule;
  children: ReactNode;
}) {
  useEffect(() => {
    configureApiClient({ apiV1Prefix: tenant.apiV1Prefix });
  }, [tenant.apiV1Prefix]);

  const value = useMemo<TenantContextValue>(
    () => ({
      tenant,
      resolution: { tenantId: tenant.id, source: 'hard-default' },
    }),
    [tenant]
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}
