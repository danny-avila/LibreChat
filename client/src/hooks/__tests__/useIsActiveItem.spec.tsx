/**
 * @jest-environment @happy-dom/jest-environment
 */
import React from 'react';
import { act, render } from '@testing-library/react';

import useIsActiveItem from '../useIsActiveItem';

function Probe() {
  const { ref, isActive } = useIsActiveItem<HTMLDivElement>();
  return <div ref={ref} data-testid="probe" data-active={isActive ? 'true' : 'false'} />;
}

const getProbe = (container: HTMLElement) =>
  container.querySelector('[data-testid="probe"]') as HTMLDivElement;

/**
 * Resolves once an attribute mutation has been delivered to observers without assuming
 * how many microtasks the environment needs to schedule it.
 */
const nextAttributeMutation = (element: HTMLElement, attributeName: string): Promise<void> =>
  new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      observer.disconnect();
      resolve();
    });
    observer.observe(element, { attributes: true, attributeFilter: [attributeName] });
  });

describe('useIsActiveItem', () => {
  it('starts with isActive=false when data-active-item is absent', () => {
    const { container } = render(<Probe />);
    expect(getProbe(container).getAttribute('data-active')).toBe('false');
  });

  it('flips isActive to true when data-active-item is added after mount', async () => {
    const { container } = render(<Probe />);
    const probe = getProbe(container);

    const delivered = nextAttributeMutation(probe, 'data-active-item');
    await act(async () => {
      probe.setAttribute('data-active-item', '');
      await delivered;
    });

    expect(probe.getAttribute('data-active')).toBe('true');
  });

  it('flips isActive back to false when data-active-item is removed', async () => {
    const { container } = render(<Probe />);
    const probe = getProbe(container);

    let delivered = nextAttributeMutation(probe, 'data-active-item');
    await act(async () => {
      probe.setAttribute('data-active-item', '');
      await delivered;
    });
    expect(probe.getAttribute('data-active')).toBe('true');

    delivered = nextAttributeMutation(probe, 'data-active-item');
    await act(async () => {
      probe.removeAttribute('data-active-item');
      await delivered;
    });
    expect(probe.getAttribute('data-active')).toBe('false');
  });

  it('ignores unrelated attribute mutations', async () => {
    const { container } = render(<Probe />);
    const probe = getProbe(container);

    const delivered = nextAttributeMutation(probe, 'data-something-else');
    await act(async () => {
      probe.setAttribute('data-something-else', 'x');
      await delivered;
    });

    expect(probe.getAttribute('data-active')).toBe('false');
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
