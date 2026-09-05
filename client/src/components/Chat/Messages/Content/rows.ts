/**
 * The vertical box of a live tool row: a 20px line with 6px margins above and
 * below, shared by every call card header and by the streaming cursor a
 * collapsed phase card renders beneath itself. The two trade places on every
 * absorb → next-call cycle of a run, so they must occupy the same height or
 * everything under the card moves on each swap.
 */
export const TOOL_ROW_CLASSES = 'relative my-1.5 flex h-5 shrink-0 items-center gap-2.5';

/**
 * The leading glyph slot of a row: 24px wide, the width of the message
 * header's avatar, and the row's own 20px tall. A 16px tool icon, the 14px
 * phase check and the 12px cursor dot all center in it, so every row's glyph
 * sits on the avatar's axis, and with the row's 8px gap every row's text
 * starts where the header's name does. `min-w` rather than `w`, so a stacked
 * icon strip can run wider without overlapping its label; never taller than
 * `TOOL_ROW_CLASSES`, whose `ProgressText` content is absolutely positioned
 * and would carry a taller slot 2px below the row's center.
 */
export const ROW_GLYPH_SLOT = 'flex h-5 min-w-6 shrink-0 items-center justify-center';
