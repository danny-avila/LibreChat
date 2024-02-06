import type { DragSource, DropTarget, Identifier } from './interfaces.js';
export declare function validateSourceContract(source: DragSource): void;
export declare function validateTargetContract(target: DropTarget): void;
export declare function validateType(type: Identifier | Identifier[], allowArray?: boolean): void;
