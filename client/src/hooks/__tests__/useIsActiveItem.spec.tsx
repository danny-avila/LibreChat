/**
 * @jest-environment @happy-dom/jest-environment
 */
import React from 'react';
import { act, render, waitFor } from '@testing-library/react';

import useIsActiveItem from '../useIsActiveItem';

function Probe() {
  const { ref, isActive } = useIsActiveItem<HTMLDivElement>();
  return <div ref={ref} data-testid="probe" data-active={isActive ? 'true' : 'false'} />;
}

/** MutationObserver delivery can slip well past a microtask on a loaded machine. */
const OBSERVER_WAIT = { timeout: 4000 };

const getProbe = (container: HTMLElement) =>
  container.querySelector('[data-testid="probe"]') as HTMLDivElement;

describe('useIsActiveItem', () => {
  it('starts with isActive=false when data-active-item is absent', () => {
    const { container } = render(<Probe />);
    expect(getProbe(container).getAttribute('data-active')).toBe('false');
  });

  it('flips isActive to true when data-active-item is added after mount', async () => {
    const { container } = render(<Probe />);
    const probe = getProbe(container);

    act(() => {
      probe.setAttribute('data-active-item', '');
    });

    // MutationObserver delivery is not guaranteed within a single microtask
    await waitFor(() => expect(probe.getAttribute('data-active')).toBe('true'), OBSERVER_WAIT);
  });

  it('flips isActive back to false when data-active-item is removed', async () => {
    const { container } = render(<Probe />);
    const probe = getProbe(container);

    act(() => {
      probe.setAttribute('data-active-item', '');
    });
    await waitFor(() => expect(probe.getAttribute('data-active')).toBe('true'), OBSERVER_WAIT);

    act(() => {
      probe.removeAttribute('data-active-item');
    });
    await waitFor(() => expect(probe.getAttribute('data-active')).toBe('false'), OBSERVER_WAIT);
  });

  it('ignores unrelated attribute mutations', async () => {
    const { container } = render(<Probe />);
    const probe = getProbe(container);

    act(() => {
      probe.setAttribute('data-something-else', 'x');
    });
    await waitFor(() => expect(probe.getAttribute('data-active')).toBe('false'), OBSERVER_WAIT);

    /** A later observed mutation proves the observer ran without the unrelated one flipping it. */
    act(() => {
      probe.setAttribute('data-active-item', '');
    });
    await waitFor(() => expect(probe.getAttribute('data-active')).toBe('true'), OBSERVER_WAIT);

    act(() => {
      probe.removeAttribute('data-active-item');
    });
    await waitFor(() => expect(probe.getAttribute('data-active')).toBe('false'), OBSERVER_WAIT);
  });

  it('disconnects the MutationObserver on unmount', async () => {
    const disconnectSpy = jest.fn();
    const realObserver = globalThis.MutationObserver;
    class SpyObserver extends realObserver {
      disconnect(): void {
        disconnectSpy();
        super.disconnect();
      }
    }
    globalThis.MutationObserver = SpyObserver;

    const { unmount } = render(<Probe />);
    unmount();

    expect(disconnectSpy).toHaveBeenCalled();

    globalThis.MutationObserver = realObserver;
  });
});
