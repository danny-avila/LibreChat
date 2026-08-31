import { useEffect } from 'react';

export const SCROLLBAR_GUTTER_PROPERTY = '--message-scrollbar-gutter';

/** Publishes the band the message column actually holds back for its scrollbar,
 *  so anything centred against that column reserves the same width instead of
 *  assuming one. `scrollbar-gutter: stable` reserves whatever the browser's own
 *  scrollbar measures, and the app only pins that down through
 *  `::-webkit-scrollbar`, which Blink and WebKit honour but Firefox ignores; an
 *  overlay scrollbar reserves nothing at all. Assuming the token there shifts
 *  the composer and the scroll-to-bottom control off the messages they align to.
 *
 *  The value is app-wide, so it lives on the document element and outlives any
 *  one thread: a second chat column measures the same band, and dropping the
 *  property when one unmounts would strand the other on the fallback. */
export default function useScrollbarGutter(
  scrollableRef: React.RefObject<HTMLDivElement | null>,
): void {
  useEffect(() => {
    const element = scrollableRef.current;
    if (!element) {
      return;
    }

    const publish = () => {
      const gutter = Math.max(0, element.offsetWidth - element.clientWidth);
      document.documentElement.style.setProperty(SCROLLBAR_GUTTER_PROPERTY, `${gutter}px`);
    };

    publish();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(publish);
    observer.observe(element);

    return () => observer.disconnect();
  }, [scrollableRef]);
}
