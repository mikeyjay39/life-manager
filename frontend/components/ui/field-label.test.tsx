import React from 'react';
import { render, screen } from '@testing-library/react-native';

import { FieldLabel } from '@/components/ui/field-label';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';

function renderLabel(props: React.ComponentProps<typeof FieldLabel>) {
  render(
    <TenantThemeTestProvider theme={defaultResolvedTheme}>
      <FieldLabel {...props} />
    </TenantThemeTestProvider>
  );
}

describe('FieldLabel', () => {
  it('given a required field when rendered then shows an asterisk and a required accessible name', () => {
    renderLabel({ label: 'Title', required: true });

    expect(screen.getByText('Title *')).toBeTruthy();
    expect(screen.getByLabelText('Title, required')).toBeTruthy();
  });

  it('given an optional field when rendered then shows the label without an asterisk', () => {
    renderLabel({ label: 'Tags' });

    expect(screen.getByText('Tags')).toBeTruthy();
    expect(screen.getByLabelText('Tags')).toBeTruthy();
    expect(screen.queryByText('Tags *')).toBeNull();
  });
});
