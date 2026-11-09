import React from 'react';
import { render, screen } from '@testing-library/react-native';

import {
  MANAGER_LIST_SKELETON_DEFAULT_ROWS,
  ManagerListSkeleton,
  ManagerSkeletonBlock,
  ManagerSkeletonRow,
} from '@/components/ui/manager-list-skeleton';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';

function renderSkeleton(
  props: Partial<React.ComponentProps<typeof ManagerListSkeleton>> = {}
) {
  render(
    <TenantThemeTestProvider theme={defaultResolvedTheme}>
      <ManagerListSkeleton {...props} />
    </TenantThemeTestProvider>
  );
}

describe('ManagerListSkeleton', () => {
  it('given default props when rendered then shows dense row placeholders', () => {
    // Given / When
    renderSkeleton({ accessibilityLabel: 'Loading documents' });

    // Then
    const root = screen.getByLabelText('Loading documents');
    expect(root).toBeTruthy();
    expect(root.props.accessibilityRole).toBe('progressbar');
    expect(root.props.accessibilityState).toEqual({ busy: true });
    expect(screen.getByTestId('manager-list-skeleton-header')).toBeTruthy();
    for (let i = 0; i < MANAGER_LIST_SKELETON_DEFAULT_ROWS; i += 1) {
      expect(screen.getByTestId(`manager-list-skeleton-row-${i}`)).toBeTruthy();
    }
  });

  it('given custom row count when rendered then shows that many rows', () => {
    renderSkeleton({ rows: 3, testID: 'custom-skeleton' });
    expect(screen.getByTestId('custom-skeleton-row-0')).toBeTruthy();
    expect(screen.getByTestId('custom-skeleton-row-2')).toBeTruthy();
    expect(screen.queryByTestId('custom-skeleton-row-3')).toBeNull();
  });
});

describe('ManagerSkeletonRow', () => {
  it('given columns when rendered then shows one bar per column', () => {
    render(
      <TenantThemeTestProvider theme={defaultResolvedTheme}>
        <ManagerSkeletonRow testID="row" columns={[1, 2]} />
      </TenantThemeTestProvider>
    );

    expect(screen.getByTestId('row-bar-0')).toBeTruthy();
    expect(screen.getByTestId('row-bar-1')).toBeTruthy();
    expect(screen.queryByTestId('row-bar-2')).toBeNull();
  });
});

describe('ManagerSkeletonBlock', () => {
  it('given a fixed width when rendered then applies that width', () => {
    render(
      <TenantThemeTestProvider theme={defaultResolvedTheme}>
        <ManagerSkeletonBlock testID="block" width={80} />
      </TenantThemeTestProvider>
    );

    expect(screen.getByTestId('block').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ width: 80 })])
    );
  });
});
