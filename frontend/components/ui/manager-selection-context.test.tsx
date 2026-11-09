import React from 'react';
import { render, screen } from '@testing-library/react-native';

import { ManagerSelectionContext } from '@/components/ui/manager-selection-context';
import {
  MANAGER_SELECTION_ACCENT_WIDTH,
  MANAGER_SELECTION_BORDER_WIDTH,
} from '@/components/ui/manager-selection';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';

function renderContext(
  props: Partial<React.ComponentProps<typeof ManagerSelectionContext>> = {}
) {
  return render(
    <TenantThemeTestProvider theme={defaultResolvedTheme}>
      <ManagerSelectionContext
        entityNoun="HealthMember"
        selectedLabel={null}
        {...props}
      />
    </TenantThemeTestProvider>
  );
}

describe('ManagerSelectionContext', () => {
  it('given no selection when rendered then shows empty copy and dashed surface', () => {
    // Given / When
    renderContext({
      emptyHint: 'Choose a HealthMember above to enter vitals.',
    });
    // Then
    expect(screen.getByLabelText('No HealthMember selected')).toBeTruthy();
    expect(
      screen.getByText('Choose a HealthMember above to enter vitals.')
    ).toBeTruthy();
    const root = screen.getByTestId('manager-selection-context');
    expect(root.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          borderStyle: 'dashed',
        }),
      ])
    );
  });

  it('given selected label when rendered then shows Selected chip with tint accent', () => {
    // Given / When
    renderContext({ selectedLabel: 'Alex' });
    // Then
    expect(screen.getByLabelText('Selected HealthMember Alex')).toBeTruthy();
    expect(screen.getByText('Selected: Alex')).toBeTruthy();
    const root = screen.getByTestId('manager-selection-context');
    expect(root.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          borderWidth: MANAGER_SELECTION_BORDER_WIDTH,
          borderLeftWidth: MANAGER_SELECTION_ACCENT_WIDTH,
        }),
      ])
    );
  });

  it('given inactive selection when rendered then marks inactive in copy', () => {
    renderContext({
      entityNoun: 'Car',
      selectedLabel: '2018 Toyota Camry',
      inactive: true,
    });
    expect(
      screen.getByLabelText('Selected Car 2018 Toyota Camry (inactive)')
    ).toBeTruthy();
    expect(
      screen.getByText('Selected: 2018 Toyota Camry (inactive)')
    ).toBeTruthy();
  });
});
