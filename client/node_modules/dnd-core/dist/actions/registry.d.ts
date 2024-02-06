import type { Action, SourceIdPayload, TargetIdPayload } from '../interfaces.js';
export declare const ADD_SOURCE = "dnd-core/ADD_SOURCE";
export declare const ADD_TARGET = "dnd-core/ADD_TARGET";
export declare const REMOVE_SOURCE = "dnd-core/REMOVE_SOURCE";
export declare const REMOVE_TARGET = "dnd-core/REMOVE_TARGET";
export declare function addSource(sourceId: string): Action<SourceIdPayload>;
export declare function addTarget(targetId: string): Action<TargetIdPayload>;
export declare function removeSource(sourceId: string): Action<SourceIdPayload>;
export declare function removeTarget(targetId: string): Action<TargetIdPayload>;
