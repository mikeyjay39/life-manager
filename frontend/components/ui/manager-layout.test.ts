import {
  MANAGER_CONTENT_GAP,
  MANAGER_CONTENT_MAX_WIDTH,
  MANAGER_CTA_MAX_WIDTH,
  MANAGER_CTA_MIN_HEIGHT,
  MANAGER_CTA_MIN_WIDTH,
  MANAGER_DATA_ACTIONS_WIDTH,
  MANAGER_DATA_CELL_GAP,
  MANAGER_DATA_ROW_GAP,
  MANAGER_DATA_ROW_PADDING_X,
  MANAGER_DATA_ROW_PADDING_Y,
  MANAGER_DATA_STACK_BELOW,
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

  it('given dense data list tokens when read then row padding is tighter than section padding', () => {
    // Given / When / Then — history rows stay denser than card-style section chrome.
    expect(MANAGER_DATA_ROW_PADDING_Y).toBeLessThan(MANAGER_SECTION_PADDING);
    expect(MANAGER_DATA_ROW_PADDING_X).toBeLessThan(MANAGER_SECTION_PADDING);
    expect(MANAGER_DATA_ROW_GAP).toBe(0);
    expect(MANAGER_DATA_CELL_GAP).toBeGreaterThan(0);
    expect(MANAGER_DATA_STACK_BELOW).toBeGreaterThan(0);
    expect(MANAGER_DATA_STACK_BELOW).toBeLessThan(MANAGER_CONTENT_MAX_WIDTH);
    expect(MANAGER_DATA_ACTIONS_WIDTH).toBeGreaterThan(MANAGER_DATA_CELL_GAP);
  });
});
