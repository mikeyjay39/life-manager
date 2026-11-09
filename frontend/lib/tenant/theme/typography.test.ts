import { Fonts } from '@/constants/theme';
import {
  TYPE_SCALE,
  productSansFamily,
  typeStyle,
  type TypeRole,
} from '@/lib/tenant/theme/typography';

describe('typography scale', () => {
  const roles: TypeRole[] = ['pageTitle', 'sectionTitle', 'body', 'meta'];

  it('given type roles when compared then each has a distinct size or weight', () => {
    // Given
    const signatures = roles.map(
      (role) =>
        `${TYPE_SCALE[role].fontSize}|${TYPE_SCALE[role].fontWeight}|${TYPE_SCALE[role].lineHeight}`
    );

    // When / Then
    expect(new Set(signatures).size).toBe(roles.length);
  });

  it('given each role when typeStyle is built then size weight and product sans apply', () => {
    for (const role of roles) {
      // Given / When
      const style = typeStyle(role);

      // Then
      expect(style.fontSize).toBe(TYPE_SCALE[role].fontSize);
      expect(style.fontWeight).toBe(TYPE_SCALE[role].fontWeight);
      expect(style.lineHeight).toBe(TYPE_SCALE[role].lineHeight);
      expect(style.fontFamily).toBe(Fonts.sans);
    }
  });

  it('given productSansFamily when called then returns configured Fonts.sans', () => {
    expect(productSansFamily()).toBe(Fonts.sans);
  });

  it('given Fonts.sans when inspected then uses a sans stack not a display face', () => {
    const family = Fonts.sans.toLowerCase();
    expect(family).not.toMatch(/decorative|display|fantasy|cursive/);
    expect(family.includes('sans') || family === 'normal' || family === 'system-ui').toBe(
      true
    );
  });
});
