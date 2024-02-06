import { NativeDragSource } from './NativeDragSource.js';
export declare function createNativeDragSource(type: string, dataTransfer?: DataTransfer): NativeDragSource;
export declare function matchNativeItemType(dataTransfer: DataTransfer | null): string | null;
