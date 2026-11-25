import { vi } from 'vitest';

vi.mock('expo-image', () => ({
  Image: 'Image',
}));

vi.mock('expo-blur', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    BlurView: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

/** Avoid expo-modules-core EventEmitter when tests import DocumentCreateForm. */
vi.mock('expo-document-picker', () => ({
  getDocumentAsync: vi.fn().mockResolvedValue({ canceled: true, assets: [] }),
}));
