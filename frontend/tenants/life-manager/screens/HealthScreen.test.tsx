import React from 'react';
import { render, screen } from '@testing-library/react-native';

import { TenantTestProvider } from '@/lib/tenant/TenantContext';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';
import type { TenantModule } from '@/lib/tenant/types';
import { lifeManagerTenantMeta } from '@/tenants/life-manager/meta';
import HealthScreen from '@/tenants/life-manager/screens/HealthScreen';

vi.mock('@/components/parallax-scroll-view', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('expo-image', () => ({
  Image: () => null,
}));

const tenant: TenantModule = {
  ...lifeManagerTenantMeta,
  screens: {
    Home: () => null,
    Health: HealthScreen,
  },
};

function renderHealthScreen() {
  return render(
    <TenantTestProvider tenant={tenant}>
      <TenantThemeTestProvider theme={defaultResolvedTheme}>
        <HealthScreen />
      </TenantThemeTestProvider>
    </TenantTestProvider>
  );
}

describe('HealthScreen', () => {
  it('shows Health Manager with section placeholders and no Documents UI', () => {
    // Given the Health Manager skeleton
    // When the screen renders
    renderHealthScreen();
    // Then the title and section placeholders are visible
    expect(screen.getByText('Health Manager')).toBeTruthy();
    expect(screen.getByLabelText('HealthMembers section')).toBeTruthy();
    expect(screen.getByLabelText('Vitals section')).toBeTruthy();
    expect(screen.getByLabelText('Doctor visits section')).toBeTruthy();
    // And Documents create/list UI is not present
    expect(screen.queryByText('Documents')).toBeNull();
    expect(screen.queryByText(/Create document/i)).toBeNull();
  });
});
