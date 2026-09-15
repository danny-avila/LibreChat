import { v4 } from 'uuid';
import type { OverlayRegistration, RegisterOverlay } from '@librechat/client';
import type { NavigationType } from 'react-router-dom';

type Marker = { token: string; kind: 'base' | 'open' | 'closed' };
type HistoryState = { idx?: number; librechatOverlay?: Marker } | null;
const URL_MIRRORED = 'librechat:url-mirrored';

/** URL mirrors must preserve Router's history identity and notify the overlay
 *  owner without navigating or initializing the streaming conversation. */
export function replaceBrowserUrl(url: string) {
  window.history.replaceState(window.history.state, '', url);
  window.dispatchEvent(new Event(URL_MIRRORED));
}

/** Synthetic entries retain the underlying Router state verbatim. Only their
 *  POPs are consumed in capture phase, so Router never sees a fake navigation.
 *  Marking the base (not just the open entry) also preserves PUSH vs REPLACE:
 *  an abandoned base is skipped, while the actual route remains navigable. */
export function createOverlayHistory(browser: Window): {
  register: RegisterOverlay;
  listen: () => () => void;
  navigated: (action: NavigationType) => void;
} {
  const layers = new Map<string, OverlayRegistration>();
  const snapshot = () => ({
    state: browser.history.state as HistoryState,
    url: browser.location.href,
  });
  let current = snapshot();
  let active: { token: string; url: string; closing: boolean } | null = null;
  let listening = false;
  let scheduled = false;
  let skipDirection: 1 | -1 | null = null;
  let mirroredPath: string | null = null;

  const reconcile = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (!listening) return;
      if (active != null) {
        if (layers.size === 0 && !active.closing) {
          active.closing = true;
          browser.history.back();
        }
        return;
      }
      if (layers.size === 0) return;
      current = snapshot();
      const token = v4();
      const state = current.state;
      browser.history.replaceState(
        { ...state, librechatOverlay: { token, kind: 'base' } },
        '',
        current.url,
      );
      browser.history.pushState(
        { ...state, librechatOverlay: { token, kind: 'open' } },
        '',
        current.url,
      );
      active = { token, url: current.url, closing: false };
      current = snapshot();
    });
  };

  const onPop = (event: PopStateEvent) => {
    const previous = current;
    current = snapshot();
    const marker = current.state?.librechatOverlay;
    if (marker?.kind === 'base' && marker.token === active?.token) {
      skipDirection = null;
      event.stopImmediatePropagation();
      const { closing, url } = active;
      active = null;
      browser.history.replaceState(
        { ...previous.state, librechatOverlay: { ...marker, kind: 'closed' } },
        '',
        url,
      );
      current = snapshot();
      if (!closing) {
        let top: OverlayRegistration | undefined;
        for (const layer of layers.values()) {
          if (top == null || layer.depth >= top.depth) top = layer;
        }
        top?.onClose();
      }
      reconcile();
      return;
    }

    const previousMarker = previous.state?.librechatOverlay;
    if (
      marker?.kind === 'base' ||
      (marker?.kind === 'closed' &&
        previousMarker?.kind === 'open' &&
        marker.token === previousMarker.token)
    ) {
      event.stopImmediatePropagation();
      /** Read, never alter, Router's index to distinguish Forward through an
       *  abandoned base from Back. Consecutive REPLACEs can share an index, so
       *  keep the traversal direction until reaching a real entry. */
      if (skipDirection == null) {
        const forward = (current.state?.idx ?? 0) > (previous.state?.idx ?? 0);
        skipDirection = forward ? 1 : -1;
      }
      browser.history.go(skipDirection);
      return;
    }
    skipDirection = null;
  };

  const mirrored = () => {
    if (new URL(current.url).pathname !== browser.location.pathname) {
      mirroredPath = browser.location.pathname;
    }
    current = snapshot();
    if (active != null) active.url = current.url;
  };

  return {
    register: (layer) => {
      layers.set(layer.id, layer);
      reconcile();
      return () => {
        if (layers.get(layer.id) !== layer) return;
        layers.delete(layer.id);
        reconcile();
      };
    },
    listen: () => {
      listening = true;
      current = snapshot();
      browser.addEventListener('popstate', onPop, true);
      browser.addEventListener(URL_MIRRORED, mirrored);
      reconcile();
      return () => {
        listening = false;
        browser.removeEventListener('popstate', onPop, true);
        browser.removeEventListener(URL_MIRRORED, mirrored);
      };
    },
    navigated: (action) => {
      const synchronizing = action === 'REPLACE' && mirroredPath === browser.location.pathname;
      mirroredPath = null;
      current = snapshot();
      if (active == null || current.state?.librechatOverlay?.token === active.token) return;
      /** FINAL catches Router up to the mirrored URL without leaving the conversation.
       *  Keep the guard, but adopt Router's new state and canonical URL for its later POP. */
      if (synchronizing) {
        browser.history.replaceState(
          { ...current.state, librechatOverlay: { token: active.token, kind: 'open' } },
          '',
          current.url,
        );
        active.url = current.url;
        current = snapshot();
        return;
      }
      active = null;
      for (const layer of layers.values()) layer.onClose();
      reconcile();
    },
  };
}
