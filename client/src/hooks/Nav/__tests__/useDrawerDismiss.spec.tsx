import { act, renderHook } from '@testing-library/react';
import useDrawerDismiss from '../useDrawerDismiss';
import { TRANSITION_MS } from '~/components/UnifiedSidebar/constants';
import { OPEN_SIDEBAR_ID } from '~/components/Chat/Menus/OpenSidebar';

type Props = {
  expanded: boolean;
  isSmallScreen: boolean;
  prefersReducedMotion: boolean;
};

function setup({
  expanded,
  isSmallScreen,
  prefersReducedMotion = false,
}: Omit<Props, 'prefersReducedMotion'> & { prefersReducedMotion?: boolean }) {
  const pane = document.createElement('div');
  pane.tabIndex = -1;
  document.body.appendChild(pane);
  const paneRef: React.RefObject<HTMLElement> = { current: pane };
  const setOpen = jest.fn();

  const view = renderHook((props: Props) => useDrawerDismiss({ ...props, paneRef, setOpen }), {
    initialProps: { expanded, isSmallScreen, prefersReducedMotion },
  });

  return { ...view, pane, setOpen };
}

function addOpener() {
  const opener = document.createElement('button');
  opener.id = OPEN_SIDEBAR_ID;
  document.body.appendChild(opener);
  return opener;
}

function clickScrim(onScrimClick: (event: React.MouseEvent<HTMLElement>) => void) {
  const scrim = document.createElement('button');
  document.body.appendChild(scrim);
  scrim.focus();
  act(() => {
    onScrimClick({ currentTarget: scrim } as unknown as React.MouseEvent<HTMLElement>);
  });
  return scrim;
}

describe('useDrawerDismiss', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  describe('the pointer guard', () => {
    it('holds the scrim through the close transition', () => {
      const { result, rerender } = setup({ expanded: true, isSmallScreen: true });
      expect(result.current.isClosing).toBe(false);

      rerender({ expanded: false, isSmallScreen: true, prefersReducedMotion: false });
      expect(result.current.isClosing).toBe(true);

      act(() => {
        jest.advanceTimersByTime(TRANSITION_MS);
      });
      expect(result.current.isClosing).toBe(false);
    });

    /**
     * Crossing to mobile derives the drawer closed with nothing to animate, so
     * arming here would leave a transparent full-screen scrim over the whole
     * viewport, swallowing every tap for the length of the guard.
     */
    it('does not arm when an expanded desktop sidebar crosses into mobile', () => {
      const { result, rerender } = setup({ expanded: true, isSmallScreen: false });

      rerender({ expanded: false, isSmallScreen: true, prefersReducedMotion: false });

      expect(result.current.isClosing).toBe(false);
    });

    it('does not arm under reduced motion, where both surfaces snap', () => {
      const { result, rerender } = setup({
        expanded: true,
        isSmallScreen: true,
        prefersReducedMotion: true,
      });

      rerender({ expanded: false, isSmallScreen: true, prefersReducedMotion: true });

      expect(result.current.isClosing).toBe(false);
    });

    it('releases the guard when the viewport crosses to desktop mid-close', () => {
      const { result, rerender } = setup({ expanded: true, isSmallScreen: true });
      rerender({ expanded: false, isSmallScreen: true, prefersReducedMotion: false });
      expect(result.current.isClosing).toBe(true);

      rerender({ expanded: false, isSmallScreen: false, prefersReducedMotion: false });

      expect(result.current.isClosing).toBe(false);
    });
  });

  describe('focus after the close', () => {
    it('hands focus to the opener when the close dropped it', () => {
      const opener = addOpener();
      const { rerender } = setup({ expanded: true, isSmallScreen: true });

      rerender({ expanded: false, isSmallScreen: true, prefersReducedMotion: false });

      expect(document.activeElement).toBe(opener);
    });

    /** Every close path goes through the committed state, not just the scrim. */
    it('restores focus under reduced motion too', () => {
      const opener = addOpener();
      const { rerender } = setup({
        expanded: true,
        isSmallScreen: true,
        prefersReducedMotion: true,
      });

      rerender({ expanded: false, isSmallScreen: true, prefersReducedMotion: true });

      expect(document.activeElement).toBe(opener);
    });

    /**
     * A route that returns a loading or error state before its header renders
     * has no opener, while the shortcut and the pane swipe still open the
     * drawer.
     */
    it('falls back to the pane when the route renders no opener', () => {
      const { rerender, pane } = setup({ expanded: true, isSmallScreen: true });

      rerender({ expanded: false, isSmallScreen: true, prefersReducedMotion: false });

      expect(document.activeElement).toBe(pane);
    });

    it('leaves focus alone when something else took it deliberately', () => {
      addOpener();
      const composer = document.createElement('textarea');
      document.body.appendChild(composer);
      const { rerender } = setup({ expanded: true, isSmallScreen: true });
      composer.focus();

      rerender({ expanded: false, isSmallScreen: true, prefersReducedMotion: false });

      expect(document.activeElement).toBe(composer);
    });

    it('reclaims focus stranded inside the drawer once it goes inert', () => {
      const opener = addOpener();
      const drawer = document.createElement('div');
      drawer.setAttribute('inert', '');
      const close = document.createElement('button');
      drawer.appendChild(close);
      document.body.appendChild(drawer);
      const { rerender } = setup({ expanded: true, isSmallScreen: true });
      close.focus();

      rerender({ expanded: false, isSmallScreen: true, prefersReducedMotion: false });

      expect(document.activeElement).toBe(opener);
    });
  });

  describe('the scrim itself', () => {
    it('closes the drawer and gives up its own focus', () => {
      const { result, setOpen } = setup({ expanded: true, isSmallScreen: true });

      const scrim = clickScrim(result.current.onScrimClick);

      expect(setOpen).toHaveBeenCalledWith(false);
      expect(document.activeElement).not.toBe(scrim);
    });

    /**
     * The scrim stays the pointer target through the guard, where the state has
     * already committed. Closing again would be a no-op that never reaches the
     * focus handoff, so the tap has to be swallowed outright.
     */
    it('swallows a tap landing after the close has committed', () => {
      const { result, rerender, setOpen } = setup({ expanded: true, isSmallScreen: true });
      rerender({ expanded: false, isSmallScreen: true, prefersReducedMotion: false });
      expect(result.current.isClosing).toBe(true);
      setOpen.mockClear();

      const scrim = clickScrim(result.current.onScrimClick);

      expect(setOpen).not.toHaveBeenCalled();
      expect(document.activeElement).not.toBe(scrim);
    });
  });
});
