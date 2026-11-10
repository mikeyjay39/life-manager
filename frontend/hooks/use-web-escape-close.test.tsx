import { cleanup, render } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { useWebEscapeClose } from '@/hooks/use-web-escape-close';

function Probe({ active, onClose }: { active: boolean; onClose: () => void }) {
  useWebEscapeClose(active, onClose);
  return null;
}

describe('useWebEscapeClose', () => {
  const originalOs = Platform.OS;
  let listeners: ((event: { key: string }) => void)[];

  beforeEach(() => {
    listeners = [];
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      get: () => 'web',
    });
    vi.stubGlobal('window', {
      addEventListener: (_type: string, handler: (event: { key: string }) => void) => {
        listeners.push(handler);
      },
      removeEventListener: (
        _type: string,
        handler: (event: { key: string }) => void
      ) => {
        listeners = listeners.filter((item) => item !== handler);
      },
    });
  });

  afterEach(() => {
    cleanup();
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      get: () => originalOs,
    });
    vi.unstubAllGlobals();
  });

  it('given active dialog on web when Escape pressed then calls onClose', () => {
    // Given
    const onClose = vi.fn();
    render(<Probe active onClose={onClose} />);

    // When
    listeners.forEach((handler) =>
      handler({ key: 'Escape', preventDefault: vi.fn() } as never)
    );

    // Then
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('given inactive dialog on web when Escape pressed then ignores', () => {
    const onClose = vi.fn();
    render(<Probe active={false} onClose={onClose} />);

    listeners.forEach((handler) =>
      handler({ key: 'Escape', preventDefault: vi.fn() } as never)
    );

    expect(onClose).not.toHaveBeenCalled();
    expect(listeners).toHaveLength(0);
  });
});
