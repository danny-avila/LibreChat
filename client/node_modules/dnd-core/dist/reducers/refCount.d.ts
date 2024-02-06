import type { Action } from '../interfaces.js';
export declare type State = number;
export declare function reduce(state: number | undefined, action: Action<any>): State;
