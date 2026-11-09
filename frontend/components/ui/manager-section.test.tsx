import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import {
  MANAGER_SECTION_GAP,
  MANAGER_SECTION_PADDING,
} from '@/components/ui/manager-layout';
import { ManagerSection } from '@/components/ui/manager-section';
import { Fonts } from '@/constants/theme';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';
import { TYPE_SCALE } from '@/lib/tenant/theme/typography';

function flattenPressableStyle(styleProp: unknown) {
  const resolved =
    typeof styleProp === 'function'
      ? styleProp({ pressed: false })
      : styleProp;
  if (Array.isArray(resolved)) {
    return Object.assign({}, ...resolved.flat(Infinity));
  }
  return resolved ?? {};
}

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

  it('given primary Add when rendered then places Add in the section action area', () => {
    // Given a migrated section supports create
    const onAdd = vi.fn();

    // When the section header renders
    renderSection({
      primaryAction: {
        label: 'Add',
        onPress: onAdd,
        accessibilityLabel: 'Add HealthMember',
      },
    });

    // Then the primary Add control appears in the section action area
    expect(screen.getByLabelText('HealthMembers actions')).toBeTruthy();
    const add = screen.getByLabelText('Add HealthMember');
    expect(add).toBeTruthy();
    // And the section title remains on the opposite side (LTR header row)
    expect(screen.getByTestId('manager-section-header')).toBeTruthy();
    expect(screen.getByText('HealthMembers')).toBeTruthy();

    fireEvent.press(add);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('given secondary Refresh when rendered then uses outline styling not primary fill', () => {
    // Given Refresh or similar secondary actions exist
    const onRefresh = vi.fn();

    // When they render in the toolbar
    renderSection({
      primaryAction: {
        label: 'Add',
        onPress: vi.fn(),
        accessibilityLabel: 'Add item',
      },
      secondaryActions: [
        {
          label: 'Refresh',
          onPress: onRefresh,
          accessibilityLabel: 'Refresh list',
        },
      ],
    });

    // Then they use secondary/outline styling rather than primary fill
    const refresh = screen.getByLabelText('Refresh list');
    const refreshStyle = flattenPressableStyle(refresh.props.style);
    expect(refreshStyle.borderWidth).toBe(StyleSheet.hairlineWidth);
    expect(refreshStyle.backgroundColor).toBe('transparent');

    const add = screen.getByLabelText('Add item');
    const addStyle = flattenPressableStyle(add.props.style);
    expect(addStyle.backgroundColor).toBe(defaultResolvedTheme.colors.light.tint);
    expect(addStyle.borderWidth).toBeUndefined();

    fireEvent.press(refresh);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('given disabled primary Add when rendered then Add stays visible and disabled', () => {
    renderSection({
      primaryAction: {
        label: 'Add',
        onPress: vi.fn(),
        accessibilityLabel: 'Add maintenance event',
        disabled: true,
      },
    });

    expect(screen.getByLabelText('Add maintenance event')).toBeDisabled();
  });

  it('given toolbarExtra when rendered then shows extra content with actions', () => {
    renderSection({
      primaryAction: {
        label: 'Create',
        onPress: vi.fn(),
        accessibilityLabel: 'Create item',
      },
      toolbarExtra: <Text>Include inactive</Text>,
    });

    expect(screen.getByText('Include inactive')).toBeTruthy();
    expect(screen.getByLabelText('Create item')).toBeTruthy();
  });
});
