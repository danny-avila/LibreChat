import React from 'react';
import { RecoilRoot, useRecoilValue } from 'recoil';
import { renderHook, act } from '@testing-library/react';
import { MOBILE_DRAWER_ID } from '~/components/UnifiedSidebar/constants';
import useSidebarToggle from '../useSidebarToggle';
import useDrawerSwipe from '../useDrawerSwipe';
import store from '~/store';

/**
 * Exercises the real seam: useSidebarToggle must start the drawer slide
 * through the swipe hook's animator BEFORE the Recoil flip commits, and fall
 * back to an immediate flip when the animator is not active (desktop).
 */
const setup = (enabled: boolean) => {
  const pane = document.createElement('div');
  const drawer = document.createElement('div');
  drawer.id = MOBILE_DRAWER_ID;
  Object.defineProperty(drawer, 'clientWidth', { value: 375, configurable: true });
  document.body.append(pane, drawer);

  jest.spyOn(window, 'matchMedia').mockReturnValue({
    matches: false,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  } as unknown as MediaQueryList);
  jest
    .spyOn(window, 'requestAnimationFrame')
    .mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });

  const paneRef = { current: pane };
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <RecoilRoot>{children}</RecoilRoot>
  );
  const rendered = renderHook(
    () => {
      useDrawerSwipe({ paneRef, enabled, open: false, onOpenChange: jest.fn() });
      return {
        setSidebarOpen: useSidebarToggle(),
        expanded: useRecoilValue(store.sidebarExpanded),
      };
    },
    { wrapper },
  );

  return {
    ...rendered,
    drawer,
    cleanup: () => {
      rendered.unmount();
      pane.remove();
      drawer.remove();
    },
  };
};

describe('useSidebarToggle', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    document.getElementById(MOBILE_DRAWER_ID)?.remove();
  });

  it('starts the drawer slide and reports it handled the animation (mobile)', () => {
    jest.useFakeTimers();
    const harness = setup(true);

    let animated = false;
    act(() => {
      animated = harness.result.current.setSidebarOpen(true);
    });

    expect(animated).toBe(true);
    expect(harness.drawer.style.transform).toBe('translate3d(0, 0, 0)');
    expect(harness.result.current.expanded).toBe(true);
    jest.useRealTimers();
    harness.cleanup();
  });

  it('flips state immediately without animating when the hook is disabled (desktop)', () => {
    const harness = setup(false);

    let animated = true;
    act(() => {
      animated = harness.result.current.setSidebarOpen(true);
    });

    expect(animated).toBe(false);
    expect(harness.drawer.style.transform).toBe('');
    expect(harness.result.current.expanded).toBe(true);
    harness.cleanup();
  });
});
