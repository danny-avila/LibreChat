import type { Action, Identifier } from '../interfaces.js';
export interface State {
    itemType: Identifier | Identifier[] | null;
    item: any;
    sourceId: string | null;
    targetIds: string[];
    dropResult: any;
    didDrop: boolean;
    isSourcePublic: boolean | null;
}
export declare function reduce(state: State | undefined, action: Action<{
    itemType: Identifier | Identifier[];
    item: any;
    sourceId: string;
    targetId: string;
    targetIds: string[];
    isSourcePublic: boolean;
    dropResult: any;
}>): State;
