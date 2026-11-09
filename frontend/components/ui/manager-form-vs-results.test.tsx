import React, { useState } from 'react';
import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import {
  ManagerFormVsResults,
  type ManagerFormMode,
} from '@/components/ui/manager-form-vs-results';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';

type HarnessProps = {
  itemCount?: number;
  mode?: ManagerFormMode;
  defaultMode?: ManagerFormMode;
  addDisabled?: boolean;
  onModeChange?: (mode: ManagerFormMode) => void;
  onCancel?: () => boolean | void;
};

function UncontrolledHarness({
  itemCount = 2,
  defaultMode,
  addDisabled,
  onModeChange,
  onCancel,
}: HarnessProps) {
  return (
    <TenantThemeTestProvider theme={defaultResolvedTheme}>
      <ManagerFormVsResults
        itemCount={itemCount}
        addLabel="Add member"
        emptyMessage="No members yet."
        defaultMode={defaultMode}
        addDisabled={addDisabled}
        onModeChange={onModeChange}
        onCancel={onCancel}
        form={<Text>Create form fields</Text>}
        results={<Text>Results list</Text>}
        testID="form-vs-results"
      />
    </TenantThemeTestProvider>
  );
}

function ControlledHarness({
  itemCount = 2,
  initialMode = 'collapsed' as ManagerFormMode,
  onCancel,
}: HarnessProps & { initialMode?: ManagerFormMode }) {
  const [mode, setMode] = useState<ManagerFormMode>(initialMode);
  return (
    <TenantThemeTestProvider theme={defaultResolvedTheme}>
      <ManagerFormVsResults
        itemCount={itemCount}
        addLabel="Add member"
        emptyMessage="No members yet."
        mode={mode}
        onModeChange={setMode}
        onCancel={onCancel}
        form={<Text>Create form fields</Text>}
        results={<Text>Results list</Text>}
        testID="form-vs-results"
      />
    </TenantThemeTestProvider>
  );
}

describe('ManagerFormVsResults', () => {
  it('given rows exist when first loaded then form is collapsed and Add is available', () => {
    // Given / When
    render(<UncontrolledHarness itemCount={3} />);

    // Then
    expect(screen.queryByText('Create form fields')).toBeNull();
    expect(screen.getByLabelText('Add member')).toBeTruthy();
    expect(screen.getByText('Results list')).toBeTruthy();
    expect(screen.getByLabelText('Manager results')).toBeTruthy();
  });

  it('given zero items when empty state renders then shows short copy and one primary Add', () => {
    // Given / When
    render(<UncontrolledHarness itemCount={0} />);

    // Then
    expect(screen.getByText('No members yet.')).toBeTruthy();
    expect(screen.getByLabelText('Manager empty state')).toBeTruthy();
    expect(screen.getByLabelText('Add member')).toBeTruthy();
    expect(screen.queryByText('Create form fields')).toBeNull();
    expect(screen.queryByLabelText('Manager results')).toBeNull();
  });

  it('given collapsed rows when Add pressed then expands create form', () => {
    // Given
    render(<UncontrolledHarness itemCount={2} />);
    expect(screen.queryByText('Create form fields')).toBeNull();

    // When
    fireEvent.press(screen.getByLabelText('Add member'));

    // Then
    expect(screen.getByText('Create form fields')).toBeTruthy();
    expect(screen.getByLabelText('Manager form')).toBeTruthy();
    expect(screen.getByLabelText('Cancel')).toBeTruthy();
    expect(screen.queryByLabelText('Add member')).toBeNull();
    expect(screen.getByText('Results list')).toBeTruthy();
  });

  it('given open form when Cancel pressed then collapses and keeps results', () => {
    // Given
    render(<UncontrolledHarness itemCount={2} defaultMode="create" />);
    expect(screen.getByText('Create form fields')).toBeTruthy();

    // When
    fireEvent.press(screen.getByLabelText('Cancel'));

    // Then
    expect(screen.queryByText('Create form fields')).toBeNull();
    expect(screen.getByLabelText('Add member')).toBeTruthy();
    expect(screen.getByText('Results list')).toBeTruthy();
  });

  it('given validation keeps form open when Cancel is blocked then form stays expanded', () => {
    // Given — parent keeps form open (e.g. confirm discard); validation normally
    // never presses Cancel, but onCancel false covers keep-open.
    const onCancel = vi.fn(() => false);
    render(<UncontrolledHarness itemCount={1} defaultMode="create" onCancel={onCancel} />);

    // When
    fireEvent.press(screen.getByLabelText('Cancel'));

    // Then
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Create form fields')).toBeTruthy();
  });

  it('given controlled edit mode when rendered then reuses form surface without Add', () => {
    // Given / When
    render(<ControlledHarness itemCount={2} initialMode="edit" />);

    // Then
    expect(screen.getByText('Create form fields')).toBeTruthy();
    expect(screen.getByLabelText('Cancel')).toBeTruthy();
    expect(screen.queryByLabelText('Add member')).toBeNull();
    expect(screen.getByText('Results list')).toBeTruthy();
  });

  it('given empty list when Add then Cancel then returns to empty state', () => {
    // Given
    render(<UncontrolledHarness itemCount={0} />);
    fireEvent.press(screen.getByLabelText('Add member'));
    expect(screen.getByText('Create form fields')).toBeTruthy();

    // When
    fireEvent.press(screen.getByLabelText('Cancel'));

    // Then
    expect(screen.getByText('No members yet.')).toBeTruthy();
    expect(screen.getByLabelText('Add member')).toBeTruthy();
  });

  it('given addDisabled when collapsed then Add is disabled and form stays collapsed', () => {
    // Given / When
    render(<UncontrolledHarness itemCount={2} addDisabled />);

    // Then — RNTL can still fire press on disabled; assert accessibility state.
    const add = screen.getByLabelText('Add member');
    expect(add.props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.queryByText('Create form fields')).toBeNull();
  });

  it('given mode change when Add pressed then notifies onModeChange', () => {
    const onModeChange = vi.fn();
    render(<UncontrolledHarness itemCount={1} onModeChange={onModeChange} />);

    fireEvent.press(screen.getByLabelText('Add member'));

    expect(onModeChange).toHaveBeenCalledWith('create');
  });
});
