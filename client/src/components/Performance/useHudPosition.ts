import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  RefObject,
  PointerEvent as ReactPointerEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from 'react';

const STORAGE_KEY = 'lc-perf-hud-position';
const MARGIN_PX = 12;
const NUDGE_PX = 16;
const FINE_NUDGE_PX = 4;

interface HudPosition {
  left: number;
  top: number;
}

function readStored(): HudPosition | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as HudPosition).left === 'number' &&
      typeof (parsed as HudPosition).top === 'number'
    ) {
      return { left: (parsed as HudPosition).left, top: (parsed as HudPosition).top };
    }
  } catch {
    /* Position is a convenience only; a broken value must not block the HUD. */
  }
  return null;
}

function clampPosition(position: HudPosition, element: HTMLElement | null): HudPosition {
  const width = element?.offsetWidth ?? 320;
  const height = element?.offsetHeight ?? 200;
  const maxLeft = Math.max(MARGIN_PX, window.innerWidth - width - MARGIN_PX);
  const maxTop = Math.max(MARGIN_PX, window.innerHeight - height - MARGIN_PX);
  return {
    left: Math.min(Math.max(MARGIN_PX, position.left), maxLeft),
    top: Math.min(Math.max(MARGIN_PX, position.top), maxTop),
  };
}

export function useHudPosition(panelRef: RefObject<HTMLDivElement | null>) {
  const [position, setPosition] = useState<HudPosition | null>(readStored);
  const positionRef = useRef(position);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);

  positionRef.current = position;

  const commit = useCallback(
    (next: HudPosition) => {
      const clamped = clampPosition(next, panelRef.current);
      positionRef.current = clamped;
      setPosition(clamped);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(clamped));
      } catch {
        /* Persisting the position is optional. */
      }
    },
    [panelRef],
  );

  const applyPosition = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) {
      return;
    }
    const current = positionRef.current;
    const next = clampPosition(
      current ?? {
        left: window.innerWidth - panel.offsetWidth - MARGIN_PX,
        top: window.innerHeight - panel.offsetHeight - MARGIN_PX,
      },
      panel,
    );
    panel.style.left = `${next.left}px`;
    panel.style.top = `${next.top}px`;
    if (current && (current.left !== next.left || current.top !== next.top)) {
      positionRef.current = next;
      setPosition(next);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* Persisting the position is optional. */
      }
    }
  }, [panelRef]);

  useLayoutEffect(() => {
    applyPosition();
  }, [applyPosition, position]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) {
      return;
    }
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(applyPosition);
    observer?.observe(panel);
    window.addEventListener('resize', applyPosition);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', applyPosition);
    };
  }, [applyPosition, panelRef]);

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      const drag = dragRef.current;
      const panel = panelRef.current;
      if (!drag || !panel || event.pointerId !== drag.pointerId) {
        return;
      }
      const next = clampPosition(
        { left: event.clientX - drag.offsetX, top: event.clientY - drag.offsetY },
        panel,
      );
      panel.style.left = `${next.left}px`;
      panel.style.top = `${next.top}px`;
    },
    [panelRef],
  );

  const onPointerEnd = useCallback(
    (event: PointerEvent) => {
      const drag = dragRef.current;
      const panel = panelRef.current;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
      if (!drag || !panel || event.pointerId !== drag.pointerId) {
        return;
      }
      dragRef.current = null;
      if (event.type === 'pointercancel') {
        applyPosition();
        return;
      }
      commit({ left: event.clientX - drag.offsetX, top: event.clientY - drag.offsetY });
    },
    [applyPosition, commit, onPointerMove, panelRef],
  );

  const onHandlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const panel = panelRef.current;
      if (!panel || event.button !== 0) {
        return;
      }
      const rect = panel.getBoundingClientRect();
      dragRef.current = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
      };
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerEnd);
      window.addEventListener('pointercancel', onPointerEnd);
    },
    [onPointerEnd, onPointerMove, panelRef],
  );

  const onHandleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      const panel = panelRef.current;
      if (!panel) {
        return;
      }
      const step = event.shiftKey ? FINE_NUDGE_PX : NUDGE_PX;
      const rect = panel.getBoundingClientRect();
      const deltas: Record<string, HudPosition> = {
        ArrowLeft: { left: rect.left - step, top: rect.top },
        ArrowRight: { left: rect.left + step, top: rect.top },
        ArrowUp: { left: rect.left, top: rect.top - step },
        ArrowDown: { left: rect.left, top: rect.top + step },
      };
      const next = deltas[event.key];
      if (!next) {
        return;
      }
      event.preventDefault();
      commit(next);
    },
    [commit, panelRef],
  );

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
      dragRef.current = null;
    };
  }, [onPointerEnd, onPointerMove]);

  return { onHandlePointerDown, onHandleKeyDown };
}
