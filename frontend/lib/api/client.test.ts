import { apiV1, resolveApiUrl } from '@/lib/api/client';

vi.mock('@/constants/config', () => ({
  API_BASE_URL: 'http://localhost:3000',
  API_V1_PREFIX: '/life-manager/api/v1',
}));

describe('api client URL helpers', () => {
  it('builds tenant-scoped v1 paths', () => {
    expect(apiV1('/auth/login')).toBe('/life-manager/api/v1/auth/login');
    expect(apiV1('documents')).toBe('/life-manager/api/v1/documents');
  });

  it('normalizes legacy /api/v1 paths', () => {
    expect(apiV1('/api/v1/auth/login')).toBe('/life-manager/api/v1/auth/login');
  });

  it('resolves full login URL for dev', () => {
    expect(resolveApiUrl('/auth/login')).toBe(
      'http://localhost:3000/life-manager/api/v1/auth/login'
    );
  });
});
