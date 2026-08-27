import type { RailEntry } from './types';

/**
 * The rail's fixed geometry.
 *
 * Every one of these numbers is load-bearing in a way that is easy to undo by
 * accident, so they live together with the reasoning attached rather than
 * scattered through the component that reads them.
 */

export const DRAG_THRESHOLD = 4;

export type RibDims = { baseW: number; baseH: number; peakW: number; peakH: number };

export const RIB_END: RibDims = { baseW: 3, baseH: 3, peakW: 4.5, peakH: 4.5 };
export const RIB_MESSAGE: RibDims = { baseW: 12, baseH: 3, peakW: 39, peakH: 6 };
/** The rib you are reading is longer at rest, so the rail answers "where am I"
 *  from length alone — the only axis a 3px line has left once colour is spent
 *  on the in-view band. */
export const RIB_CURRENT: RibDims = { baseW: 21, baseH: 3, peakW: 39, peakH: 6 };
/** Row height in px. `peakH` may reach it but never exceed it: the magnifier
 *  writes into normal flow, and a rib taller than its row would reflow every
 *  rib below the pointer — moving the rail out from under the pointer and
 *  leaving the measured centres (and so the preview and the click target)
 *  pointing at the wrong message. */
export const RIB_ROW_HEIGHT = 6;

/** Vertical falloff radius (content-space px) over which neighbouring ribs magnify. */
export const MAG_INFLUENCE = 50;
/** Delay before the shared preview first opens; subsequent moves reposition instantly. */
export const TOOLTIP_OPEN_DELAY = 60;

export function ribDimsFor(entry: RailEntry, isCurrent = false): RibDims {
  if (entry.isEnd === true || entry.isStart === true) {
    return RIB_END;
  }
  return isCurrent ? RIB_CURRENT : RIB_MESSAGE;
}

/** Cosine bell: 1 at the pointer, easing to 0 at the influence radius. */
export function magnifyFalloff(distance: number, influence: number): number {
  if (distance >= influence) {
    return 0;
  }
  return 0.5 * (1 + Math.cos((Math.PI * distance) / influence));
}
