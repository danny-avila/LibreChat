import type { Action, DragDropManager, HoverOptions, HoverPayload } from '../../interfaces.js';
export declare function createHover(manager: DragDropManager): (targetIdsArg: string[], { clientOffset }?: HoverOptions) => Action<HoverPayload>;
