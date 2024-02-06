import { Subscribable } from './subscribable';
declare type SetupFn = (setFocused: (focused?: boolean) => void) => (() => void) | undefined;
export declare class FocusManager extends Subscribable {
    private focused?;
    private cleanup?;
    private setup;
    constructor();
    protected onSubscribe(): void;
    protected onUnsubscribe(): void;
    setEventListener(setup: SetupFn): void;
    setFocused(focused?: boolean): void;
    onFocus(): void;
    isFocused(): boolean;
}
export declare const focusManager: FocusManager;
export {};
//# sourceMappingURL=focusManager.d.ts.map