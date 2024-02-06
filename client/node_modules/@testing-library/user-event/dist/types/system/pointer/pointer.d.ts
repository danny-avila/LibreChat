import { type Instance } from '../../setup';
import { pointerKey, PointerPosition } from './shared';
type PointerInit = {
    pointerId: number;
    pointerType: string;
    isPrimary: boolean;
};
export declare class Pointer {
    constructor({ pointerId, pointerType, isPrimary }: PointerInit);
    readonly pointerId: number;
    readonly pointerType: string;
    readonly isPrimary: boolean;
    isMultitouch: boolean;
    isCancelled: boolean;
    isDown: boolean;
    isPrevented: boolean;
    position: PointerPosition;
    init(instance: Instance, position: PointerPosition): this;
    move(instance: Instance, position: PointerPosition): {
        leave: () => void;
        enter: () => void;
        move: () => void;
    } | undefined;
    down(instance: Instance, _keyDef: pointerKey): void;
    up(instance: Instance, _keyDef: pointerKey): void;
    release(instance: Instance): void;
    private getTarget;
    private getEventInit;
}
export {};
