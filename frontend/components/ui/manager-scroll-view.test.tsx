import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { MANAGER_CONTENT_GAP } from '@/components/ui/manager-layout';
import { ManagerScrollView } from '@/components/ui/manager-scroll-view';
import { ManagerSection } from '@/components/ui/manager-section';
import { Fonts } from '@/constants/theme';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';
import { TYPE_SCALE } from '@/lib/tenant/theme/typography';

vi.mock('@/components/app-menu-bar', () => ({
  default: () => <Text>App menu</Text>,
}));

function renderScroll(ui: React.ReactElement) {
  return render(
    <TenantThemeTestProvider theme={defaultResolvedTheme}>{ui}</TenantThemeTestProvider>
  );
}

function flatStyle(node: { props: { style?: unknown } }) {
  const style = node.props.style;
  return Array.isArray(style) ? Object.assign({}, ...style.flat(Infinity)) : style;
}

describe('ManagerScrollView', () => {
  it('given manager page when rendered then shows menu and title without parallax header image', () => {
    // Given a quiet manager shell
    // When the shell renders
    renderScroll(
      <ManagerScrollView title="Car Manager" testID="manager-scroll">
        <Text>Body section</Text>
      </ManagerScrollView>
    );
    // Then menu and page title are visible under the menu
    expect(screen.getByText('App menu')).toBeTruthy();
    expect(screen.getByText('Car Manager')).toBeTruthy();
    expect(screen.getByText('Body section')).toBeTruthy();
    expect(screen.getByLabelText('Car Manager page')).toBeTruthy();
    // And no header image / parallax chrome is present
    expect(screen.queryByLabelText(/header image/i)).toBeNull();
  });

  it('given optional subtitle when rendered then shows subtitle under title', () => {
    // Given a subtitle
    renderScroll(
      <ManagerScrollView title="Documents" subtitle="Files and Proton">
        <Text>Body</Text>
      </ManagerScrollView>
    );
    // Then subtitle is visible
    expect(screen.getByText('Files and Proton')).toBeTruthy();
  });

  it('given page title and section titles when rendered then page title outranks section titles', () => {
    // Given a migrated manager screen with shared section chrome
    renderScroll(
      <ManagerScrollView title="Health Manager">
        <ManagerSection title="HealthMembers" testID="section-a">
          <Text>Members body</Text>
        </ManagerSection>
        <ManagerSection title="Vitals" testID="section-b">
          <Text>Vitals body</Text>
        </ManagerSection>
      </ManagerScrollView>
    );

    // When titles render
    const pageTitle = flatStyle(screen.getByText('Health Manager'));
    const sectionTitle = flatStyle(screen.getByText('HealthMembers'));

    // Then page title uses pageTitle; section titles use quieter sectionTitle
    expect(pageTitle.fontSize).toBe(TYPE_SCALE.pageTitle.fontSize);
    expect(pageTitle.fontFamily).toBe(Fonts.sans);
    expect(sectionTitle.fontSize).toBe(TYPE_SCALE.sectionTitle.fontSize);
    expect(pageTitle.fontSize).toBeGreaterThan(sectionTitle.fontSize);

    // And adjacent sections share the page content gap token
    const pageContent = screen.getByTestId('manager-page-content');
    expect(pageContent.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gap: MANAGER_CONTENT_GAP,
        }),
      ])
    );
    expect(screen.getByTestId('section-a')).toBeTruthy();
    expect(screen.getByTestId('section-b')).toBeTruthy();
  });
});
