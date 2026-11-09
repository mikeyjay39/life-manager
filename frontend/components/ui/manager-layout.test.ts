import {
  MANAGER_CONTENT_MAX_WIDTH,
  MANAGER_CTA_MAX_WIDTH,
  MANAGER_CTA_MIN_HEIGHT,
  MANAGER_CTA_MIN_WIDTH,
} from '@/components/ui/manager-layout';

describe('manager-layout constants', () => {
  it('given shared layout tokens when read then content max width exceeds CTA max width', () => {
    // Given / When / Then — content column stays wider than a single CTA.
    expect(MANAGER_CONTENT_MAX_WIDTH).toBeGreaterThan(MANAGER_CTA_MAX_WIDTH);
    expect(MANAGER_CTA_MAX_WIDTH).toBeGreaterThanOrEqual(MANAGER_CTA_MIN_WIDTH);
    expect(MANAGER_CTA_MIN_HEIGHT).toBeGreaterThanOrEqual(44);
  });
});
