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

/**
 * Observer delivery lands on the next microtask in this environment; the wait exists so the
 * test does not depend on that scheduling detail, with budget to ride out a stalled host.
 */
const OBSERVER_WAIT = { timeout: 4000 };

/** One test chains two OBSERVER_WAITs, whose budget exceeds Jest's 5s default. */
jest.setTimeout(20_000);

const getProbe = (container: HTMLElement) =>
  container.querySelector('[data-testid="probe"]') as HTMLDivElement;

/**
 * Resolves once an attribute mutation on `element` has been delivered to observers. The
 * hook's observer filters on `data-active-item`, so it is never notified of the unrelated
 * mutation; this unfiltered observer proves delivery happened before the test asserts
 * that the hook did not react.
 *
 * Rejects if no attribute mutation is delivered within `timeoutMs` so a silent host fails
 * with a clear error instead of hanging until the suite Jest timeout.
 */
const nextAttributeMutation = (element: HTMLElement, timeoutMs = 4000): Promise<void> =>
  new Promise((resolve, reject) => {
    let settled = false;
    const observer = new MutationObserver(() => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      observer.disconnect();
      resolve();
    });
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      observer.disconnect();
      reject(new Error(`Timed out waiting for attribute mutation after ${timeoutMs}ms`));
    }, timeoutMs);
    observer.observe(element, { attributes: true });
  });

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

    const delivered = nextAttributeMutation(probe);
    await act(async () => {
      probe.setAttribute('data-something-else', 'x');
      await delivered;
    });

    expect(probe.getAttribute('data-active')).toBe('false');
  });

  it('disconnects the MutationObserver on unmount', () => {
    const disconnectSpy = jest.fn();
    const realObserver = globalThis.MutationObserver;
    class SpyObserver extends realObserver {
      disconnect(): void {
        disconnectSpy();
        super.disconnect();
      }
    }
    globalThis.MutationObserver = SpyObserver;

    try {
      const { unmount } = render(<Probe />);
      unmount();
      expect(disconnectSpy).toHaveBeenCalled();
    } finally {
      globalThis.MutationObserver = realObserver;
    }
  });
});
