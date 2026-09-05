/**
 * The vertical box of a live tool row: a 20px line with 6px margins above and
 * below, shared by every call card header and by the streaming cursor a
 * collapsed phase card renders beneath itself. The two trade places on every
 * absorb → next-call cycle of a run, so they must occupy the same height or
 * everything under the card moves on each swap.
 */
export const TOOL_ROW_CLASSES = 'relative my-1.5 flex h-5 shrink-0 items-center gap-2.5';
