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

/** Publishes the same band before any message column has mounted. The welcome
 *  screen holds it back too — it centres greeting and composer against where the
 *  message column will be — and on a fresh load nothing has measured it, so the
 *  spacer would fall back to the `--scrollbar-size` token: a fixed 8px, right
 *  only where the app's own `::-webkit-scrollbar` width applies and wrong on
 *  every overlay-scrollbar platform, which reserves nothing.
 *
 *  A detached probe built like the column — `overflow-y: auto` with
 *  `scrollbar-gutter: stable` — answers the same question the column does, and
 *  answers it for the platform in front of the user. A mounted column measures
 *  itself and is authoritative, so this only fills the gap before the first one
 *  exists and never overwrites a published measurement. */
export function useScrollbarGutterSeed(): void {
  useEffect(() => {
    const root = document.documentElement;
    if (root.style.getPropertyValue(SCROLLBAR_GUTTER_PROPERTY) !== '') {
      return;
    }

    const probe = document.createElement('div');
    probe.style.position = 'absolute';
    probe.style.top = '-9999px';
    probe.style.width = '100px';
    probe.style.height = '100px';
    probe.style.overflowY = 'auto';
    probe.style.scrollbarGutter = 'stable';
    probe.style.visibility = 'hidden';
    document.body.appendChild(probe);
    const gutter = Math.max(0, probe.offsetWidth - probe.clientWidth);
    probe.remove();

    root.style.setProperty(SCROLLBAR_GUTTER_PROPERTY, `${gutter}px`);
  }, []);
}
