import React from 'react';
import { render, screen } from '@testing-library/react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { TenantThemeTestProvider } from '@/lib/tenant/TenantThemeContext';
import { defaultResolvedTheme } from '@/lib/tenant/theme/defaults';
import { TYPE_SCALE } from '@/lib/tenant/theme/typography';

function renderText(
  props: Partial<React.ComponentProps<typeof ThemedText>> & { children?: string } = {}
) {
  const { children = 'Sample', ...rest } = props;
  render(
    <TenantThemeTestProvider theme={defaultResolvedTheme}>
      <ThemedText testID="themed-text" {...rest}>
        {children}
      </ThemedText>
    </TenantThemeTestProvider>
  );
}

function flatStyle(node: ReturnType<typeof screen.getByTestId>) {
  const style = node.props.style;
  return Array.isArray(style) ? Object.assign({}, ...style.flat(Infinity)) : style;
}

describe('ThemedText typography', () => {
  it('given pageTitle when rendered then uses page title scale and product sans', () => {
    // Given / When
    renderText({ type: 'pageTitle' });

    // Then
    const style = flatStyle(screen.getByTestId('themed-text'));
    expect(style.fontSize).toBe(TYPE_SCALE.pageTitle.fontSize);
    expect(style.fontWeight).toBe(TYPE_SCALE.pageTitle.fontWeight);
    expect(style.fontFamily).toBe(Fonts.sans);
  });

  it('given legacy title alias when rendered then matches pageTitle scale', () => {
    renderText({ type: 'title' });
    const style = flatStyle(screen.getByTestId('themed-text'));
    expect(style.fontSize).toBe(TYPE_SCALE.pageTitle.fontSize);
    expect(style.fontWeight).toBe(TYPE_SCALE.pageTitle.fontWeight);
  });

  it('given sectionTitle when rendered then uses section title scale', () => {
    renderText({ type: 'sectionTitle' });
    const style = flatStyle(screen.getByTestId('themed-text'));
    expect(style.fontSize).toBe(TYPE_SCALE.sectionTitle.fontSize);
    expect(style.fontWeight).toBe(TYPE_SCALE.sectionTitle.fontWeight);
  });

  it('given body when rendered then uses body scale', () => {
    renderText({ type: 'body' });
    const style = flatStyle(screen.getByTestId('themed-text'));
    expect(style.fontSize).toBe(TYPE_SCALE.body.fontSize);
    expect(style.fontWeight).toBe(TYPE_SCALE.body.fontWeight);
  });

  it('given meta when rendered then uses meta scale and muted color', () => {
    renderText({ type: 'meta' });
    const style = flatStyle(screen.getByTestId('themed-text'));
    expect(style.fontSize).toBe(TYPE_SCALE.meta.fontSize);
    expect(style.fontWeight).toBe(TYPE_SCALE.meta.fontWeight);
    expect(style.color).toBe(defaultResolvedTheme.colors.light.muted);
  });
});
