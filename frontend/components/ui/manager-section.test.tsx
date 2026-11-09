import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import {
  MANAGER_SECTION_GAP,
  MANAGER_SECTION_PADDING,
} from '@/components/ui/manager-layout';
import { ManagerSection } from '@/components/ui/manager-section';
import { Fonts } from '@/constants/theme';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';
import { TYPE_SCALE } from '@/lib/tenant/theme/typography';

function renderSection(
  props: Partial<React.ComponentProps<typeof ManagerSection>> = {}
) {
  render(
    <TenantThemeTestProvider theme={defaultResolvedTheme}>
      <ManagerSection title="HealthMembers" testID="manager-section" {...props}>
        {props.children ?? <Text>Section body</Text>}
      </ManagerSection>
    </TenantThemeTestProvider>
  );
}

describe('ManagerSection', () => {
  it('given a title when rendered then shows title and body with shared spacing', () => {
    // Given / When
    renderSection();

    // Then
    expect(screen.getByText('HealthMembers')).toBeTruthy();
    expect(screen.getByText('Section body')).toBeTruthy();
    expect(screen.getByLabelText('HealthMembers section')).toBeTruthy();

    const root = screen.getByTestId('manager-section');
    expect(root.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          padding: MANAGER_SECTION_PADDING,
          gap: MANAGER_SECTION_GAP,
          width: '100%',
        }),
      ])
    );
  });

  it('given a custom accessibilityLabel when rendered then uses that label', () => {
    renderSection({ accessibilityLabel: 'Members chrome' });
    expect(screen.getByLabelText('Members chrome')).toBeTruthy();
  });

  it('given a section title when rendered then uses sectionTitle type scale', () => {
    renderSection();
    const title = screen.getByText('HealthMembers');
    const style = title.props.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style.flat(Infinity)) : style;
    expect(flat.fontSize).toBe(TYPE_SCALE.sectionTitle.fontSize);
    expect(flat.fontWeight).toBe(TYPE_SCALE.sectionTitle.fontWeight);
    expect(flat.fontFamily).toBe(Fonts.sans);
  });
});
