import {
  MANAGER_CONTENT_GAP,
  MANAGER_CONTENT_MAX_WIDTH,
  MANAGER_CTA_MAX_WIDTH,
  MANAGER_CTA_MIN_HEIGHT,
  MANAGER_CTA_MIN_WIDTH,
  MANAGER_PAGE_PADDING_Y,
  MANAGER_SECTION_GAP,
  MANAGER_SECTION_PADDING,
} from '@/components/ui/manager-layout';

describe('manager-layout constants', () => {
  it('given shared layout tokens when read then content max width exceeds CTA max width', () => {
    // Given / When / Then — content column stays wider than a single CTA.
    expect(MANAGER_CONTENT_MAX_WIDTH).toBeGreaterThan(MANAGER_CTA_MAX_WIDTH);
    expect(MANAGER_CTA_MAX_WIDTH).toBeGreaterThanOrEqual(MANAGER_CTA_MIN_WIDTH);
    expect(MANAGER_CTA_MIN_HEIGHT).toBeGreaterThanOrEqual(44);
  });

  it('given density tokens when read then section stack gap matches shared section gap', () => {
    // Given / When / Then — adjacent sections share one vertical rhythm token.
    expect(MANAGER_CONTENT_GAP).toBe(MANAGER_SECTION_GAP);
    expect(MANAGER_SECTION_PADDING).toBe(MANAGER_CONTENT_GAP);
    expect(MANAGER_PAGE_PADDING_Y).toBe(MANAGER_CONTENT_GAP);
    expect(MANAGER_CONTENT_GAP).toBeGreaterThan(0);
  });
});
