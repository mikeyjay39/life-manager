import React from 'react';
import { Modal } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { useWebEscapeClose } from '@/hooks/use-web-escape-close';
import type { DocumentDto } from '@/lib/api/types';
import { formatDisplayDate } from '@/lib/format/display';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';
import DocumentPickerModal, { type DocumentPickerModalProps } from './document-picker-modal';

vi.mock('@/hooks/use-web-escape-close', () => ({ useWebEscapeClose: vi.fn() }));

const insurance: DocumentDto = {
  id: 'insurance', title: 'Insurance card', content: '', tags: [],
  created_at: '2026-01-02T12:00:00Z', issued_date: '2026-01-01', expire_date: '2027-01-01',
  storage: { provider: 'proton', share_id: 'share', node_id: 'node', filename: 'policy.pdf', mime_type: 'application/pdf' },
};
const registration: DocumentDto = { ...insurance, id: 'registration', title: 'Registration', storage: null };

function setup(overrides: Partial<DocumentPickerModalProps> = {}) {
  const props: DocumentPickerModalProps = {
    visible: true, documents: [insurance, registration], selectedDocumentId: insurance.id,
    onSelect: vi.fn(), onClose: vi.fn(), ...overrides,
  };
  const tree = (next: DocumentPickerModalProps) => (
    <TenantThemeTestProvider theme={defaultResolvedTheme}><DocumentPickerModal {...next} /></TenantThemeTestProvider>
  );
  const result = render(tree(props));
  return { ...result, props, reopen: () => { result.rerender(tree({ ...props, visible: false })); result.rerender(tree(props)); } };
}

describe('DocumentPickerModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('given a closed picker then renders no document list', () => {
    setup({ visible: false });
    expect(screen.queryByLabelText('Search documents')).toBeNull();
    expect(screen.queryByText('Insurance card')).toBeNull();
  });

  it('given authorized documents when opened then shows names, metadata, and the current selection', () => {
    setup();
    expect(screen.getByLabelText('Choose document').props.role).toBe('dialog');
    expect(screen.getByLabelText('Choose document Insurance card').props.accessibilityState.selected).toBe(true);
    expect(screen.getByText('Current selection')).toBeTruthy();
    expect(screen.getByText('policy.pdf')).toBeTruthy();
    expect(screen.getByText('File type: application/pdf')).toBeTruthy();
    expect(screen.getAllByText(`Created: ${formatDisplayDate(insurance.created_at)}`)).toHaveLength(2);
    expect(screen.getAllByText(`Issued: ${formatDisplayDate(insurance.issued_date)}`)).toHaveLength(2);
    expect(screen.getAllByText(`Expires: ${formatDisplayDate(insurance.expire_date)}`)).toHaveLength(2);
  });

  it('when searching then matches names and filenames without case sensitivity', () => {
    setup();
    fireEvent.changeText(screen.getByLabelText('Search documents'), ' REGist ');
    expect(screen.queryByLabelText('Choose document Insurance card')).toBeNull();
    expect(screen.getByLabelText('Choose document Registration')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Search documents'), 'POLICY.PDF');
    expect(screen.getByLabelText('Choose document Insurance card')).toBeTruthy();
    expect(screen.queryByLabelText('Choose document Registration')).toBeNull();
  });

  it('when a row is chosen then waits for Select document before applying it', () => {
    const { props } = setup();
    fireEvent.press(screen.getByLabelText('Choose document Registration'));
    expect(props.onSelect).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Choose document Registration').props.accessibilityState.selected).toBe(true);
    fireEvent.press(screen.getByLabelText('Select document'));
    expect(props.onSelect).toHaveBeenCalledExactlyOnceWith(registration);
  });

  it.each(['Cancel document selection', 'Close document picker'])(
    'when dismissed with %s then does not apply the draft and resets on reopen', (label) => {
      const { props, reopen } = setup();
      fireEvent.press(screen.getByLabelText('Choose document Registration'));
      fireEvent.changeText(screen.getByLabelText('Search documents'), 'Registration');
      fireEvent.press(screen.getByLabelText(label));
      expect(props.onClose).toHaveBeenCalledOnce();
      expect(props.onSelect).not.toHaveBeenCalled();
      reopen();
      expect(screen.getByLabelText('Search documents').props.value).toBe('');
      expect(screen.getByLabelText('Choose document Insurance card').props.accessibilityState.selected).toBe(true);
    }
  );

  it('when Escape or native back dismisses then preserves the existing selection', () => {
    const { props } = setup();
    fireEvent.press(screen.getByLabelText('Choose document Registration'));
    const close = vi.mocked(useWebEscapeClose).mock.calls.at(-1)![1];
    close();
    fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose');
    expect(props.onClose).toHaveBeenCalledTimes(2);
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('given no current selection then disables confirmation until a row is chosen', () => {
    const { props } = setup({ selectedDocumentId: null });
    fireEvent.press(screen.getByLabelText('Select document'));
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('given loading or an error then blocks selection and offers retry on error', () => {
    const { props, rerender } = setup({ loading: true });
    expect(screen.getByLabelText('Loading documents')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Select document'));
    expect(props.onSelect).not.toHaveBeenCalled();
    const retry = vi.fn();
    rerender(<TenantThemeTestProvider theme={defaultResolvedTheme}><DocumentPickerModal {...props} loading={false} error="Cannot load documents." onRetry={retry} /></TenantThemeTestProvider>);
    expect(screen.getByText('Cannot load documents.')).toBeTruthy();
    expect(screen.queryByText('Insurance card')).toBeNull();
    fireEvent.press(screen.getByLabelText('Retry loading documents'));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('given no documents or no matches then shows the appropriate empty state', () => {
    const { unmount } = setup({ documents: [] });
    expect(screen.getByText('No documents yet. Create a document to link it.')).toBeTruthy();
    unmount();
    setup();
    fireEvent.changeText(screen.getByLabelText('Search documents'), 'missing');
    expect(screen.getByText('No matching documents.')).toBeTruthy();
  });
});
