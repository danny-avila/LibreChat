import { type Instance } from '../../setup';
import { type Pointer } from './pointer';
import { pointerKey, PointerPosition } from './shared';
/**
 * This object is the single "virtual" mouse that might be controlled by multiple different pointer devices.
 */
export declare class Mouse {
    position: PointerPosition;
    private readonly buttons;
    private selecting?;
    private buttonDownTarget;
    private readonly clickCount;
    move(instance: Instance, position: PointerPosition): {
        leave: () => void;
        enter: () => void;
        move: () => void;
    } | undefined;
    down(instance: Instance, keyDef: pointerKey, pointer: Pointer): void;
    up(instance: Instance, keyDef: pointerKey, pointer: Pointer): void;
    resetClickCount(): void;
    private getEventInit;
    private getTarget;
    private startSelecting;
    private modifySelecting;
    private endSelecting;
}
