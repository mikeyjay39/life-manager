import React from 'react';
import { render, screen } from '@testing-library/react-native';

import { ManagerPageHeader } from '@/components/ui/manager-page-header';
import { Fonts } from '@/constants/theme';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';
import { TYPE_SCALE } from '@/lib/tenant/theme/typography';

function renderHeader(ui: React.ReactElement) {
  return render(
    <TenantThemeTestProvider theme={defaultResolvedTheme}>{ui}</TenantThemeTestProvider>
  );
}

function flatStyle(node: { props: { style?: unknown } }) {
  const style = node.props.style;
  return Array.isArray(style) ? Object.assign({}, ...style.flat(Infinity)) : style;
}

describe('ManagerPageHeader', () => {
  it('given title when rendered then shows compact title without subtitle', () => {
    // Given a title only
    // When the header renders
    renderHeader(<ManagerPageHeader title="Document Manager" testID="page-header" />);
    // Then the title is visible and no subtitle text appears
    expect(screen.getByText('Document Manager')).toBeTruthy();
    expect(screen.getByTestId('page-header')).toBeTruthy();
  });

  it('given title and subtitle when rendered then shows both', () => {
    // Given a title and subtitle
    // When the header renders
    renderHeader(
      <ManagerPageHeader title="Health Manager" subtitle="Track family vitals" />
    );
    // Then both lines are visible
    expect(screen.getByText('Health Manager')).toBeTruthy();
    expect(screen.getByText('Track family vitals')).toBeTruthy();
  });

  it('given page title when rendered then uses pageTitle type scale', () => {
    // Given / When
    renderHeader(<ManagerPageHeader title="Car Manager" />);
    const title = screen.getByText('Car Manager');
    const flat = flatStyle(title);

    // Then page title outranks section titles via shared pageTitle style
    expect(flat.fontSize).toBe(TYPE_SCALE.pageTitle.fontSize);
    expect(flat.fontWeight).toBe(TYPE_SCALE.pageTitle.fontWeight);
    expect(flat.fontFamily).toBe(Fonts.sans);
    expect(TYPE_SCALE.pageTitle.fontSize).toBeGreaterThan(
      TYPE_SCALE.sectionTitle.fontSize
    );
  });

  it('given subtitle when rendered then uses quieter meta type scale', () => {
    renderHeader(
      <ManagerPageHeader title="Documents" subtitle="Files and Proton" />
    );
    const subtitle = screen.getByText('Files and Proton');
    const flat = flatStyle(subtitle);
    expect(flat.fontSize).toBe(TYPE_SCALE.meta.fontSize);
    expect(flat.fontWeight).toBe(TYPE_SCALE.meta.fontWeight);
  });
});
