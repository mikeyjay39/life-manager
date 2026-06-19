import { vi } from 'vitest';

vi.mock('expo-image', () => ({
  Image: 'Image',
}));
