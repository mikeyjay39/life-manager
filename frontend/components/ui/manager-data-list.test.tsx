import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import {
  ManagerDataList,
  ManagerDataListRow,
} from '@/components/ui/manager-data-list';
import {
  MANAGER_DATA_ROW_PADDING_Y,
  MANAGER_SECTION_PADDING,
} from '@/components/ui/manager-layout';
import { TYPE_SCALE } from '@/lib/tenant/theme/typography';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';

function renderList(stackBelowWidth: number) {
  return render(
    <TenantThemeTestProvider theme={defaultResolvedTheme}>
      <ManagerDataList
        accessibilityLabel="Sample history"
        testID="sample-list"
        stackBelowWidth={stackBelowWidth}
        leadingHeader="Date"
        columnHeaders={[
          { key: 'primary', label: 'Vitals', primary: true },
          { key: 'notes', label: 'Notes' },
        ]}
      >
        <ManagerDataListRow
          testID="sample-row"
          accessibilityLabel="Row on 2026-03-01"
          leading="2026-03-01"
          cells={[
            { key: 'primary', content: '70.5 kg', primary: true },
            {
              key: 'notes',
              content: 'Felt fine after a long walk in the park',
              accessibilityLabel: 'Felt fine after a long walk in the park',
            },
          ]}
          actions={<Text accessibilityLabel="Edit sample row">Edit</Text>}
        />
        <ManagerDataListRow
          testID="sample-row-empty"
          accessibilityLabel="Row on 2026-03-02"
          leading="2026-03-02"
          cells={[
            { key: 'primary', content: '—', primary: true },
            { key: 'notes', content: '—', accessibilityLabel: 'Notes: none' },
          ]}
          actions={<Text accessibilityLabel="Edit empty row">Edit</Text>}
        />
      </ManagerDataList>
    </TenantThemeTestProvider>
  );
}

describe('ManagerDataList', () => {
  it('given a wide viewport when rendered then keeps one horizontal band with actions', () => {
    // Given stackBelowWidth 0 so the current width stays above the breakpoint
    renderList(0);

    // Then leading, cells, and actions stay in one reachable row
    expect(screen.getByLabelText('Sample history')).toBeTruthy();
    expect(screen.getByLabelText('Row on 2026-03-01')).toBeTruthy();
    expect(screen.getByText('2026-03-01')).toBeTruthy();
    expect(screen.getByText('70.5 kg')).toBeTruthy();
    expect(screen.getByLabelText('Edit sample row')).toBeTruthy();
    expect(screen.getByTestId('sample-row').props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ flexDirection: 'row' }),
      ])
    );
  });

  it('given a narrow viewport when rendered then stacks cells under the leading column', () => {
    // Given a very high breakpoint so the current width stacks
    renderList(100_000);

    // Then the row uses the stacked dense pattern without dropping actions
    expect(screen.getByTestId('sample-row').props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ flexDirection: 'column' }),
      ])
    );
    expect(screen.getByLabelText('Edit sample row')).toBeTruthy();
    expect(screen.getByText('70.5 kg')).toBeTruthy();
  });

  it('given meta cells when rendered then uses muted meta typography', () => {
    // Given / When a row with primary and meta cells
    renderList(0);

    // Then meta copy uses the meta scale and muted color
    const notes = screen.getByText('Felt fine after a long walk in the park');
    const style = Array.isArray(notes.props.style)
      ? Object.assign({}, ...notes.props.style)
      : notes.props.style;
    expect(style.fontSize).toBe(TYPE_SCALE.meta.fontSize);
    expect(style.color).toBe(defaultResolvedTheme.colors.light.muted);
  });

  it('given dense row tokens when rendered then vertical padding is tighter than section chrome', () => {
    // Given / When / Then — dense rows stay tighter than card-style section padding.
    expect(MANAGER_DATA_ROW_PADDING_Y).toBeLessThan(MANAGER_SECTION_PADDING);
    renderList(0);
    expect(screen.getByTestId('sample-row').props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          paddingVertical: MANAGER_DATA_ROW_PADDING_Y,
        }),
      ])
    );
  });

  it('given fixed column headers when a row omits values then empty slots keep alignment', () => {
    // Given / When two rows with the same column keys
    renderList(0);

    // Then headers name the columns and empty cells still occupy slots
    expect(screen.getByTestId('sample-list-header')).toBeTruthy();
    expect(screen.getByText('Vitals')).toBeTruthy();
    expect(screen.getByText('Notes')).toBeTruthy();
    expect(screen.getByTestId('sample-row-empty-cells').children).toHaveLength(2);
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });
});
