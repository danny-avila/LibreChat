/**
 * One rib on a navigation rail.
 *
 * The rail is deliberately ignorant of what an entry *is*. A message row, an
 * in-thread steer, a search hit and the synthetic origin/terminus markers all
 * reduce to the same four facts, which is the whole reason one rail can serve
 * more than one surface.
 */
export interface RailEntry {
  id: string;
  /** Drives nothing visual today; owners use it to pick a label. */
  isUser: boolean;
  preview: string;
  /** The terminus and origin ribs are round markers rather than lines. */
  isEnd?: boolean;
  isStart?: boolean;
}

/**
 * The span of entries the reader can currently see, in entry-index terms.
 *
 * The rail keeps this span framed in its own scroll area but has no way to work
 * it out: one owner reads it from measured row offsets, another from a
 * virtualized list's rendered window. `atEnd` asks for the bottom of the rail
 * rather than a centred span, which is what "the reader has reached the end"
 * should look like however the owner detects it.
 */
export interface RailWindow {
  first: number;
  last: number;
  atEnd: boolean;
}
