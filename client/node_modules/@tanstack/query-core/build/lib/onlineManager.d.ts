import { Subscribable } from './subscribable';
declare type SetupFn = (setOnline: (online?: boolean) => void) => (() => void) | undefined;
export declare class OnlineManager extends Subscribable {
    private online?;
    private cleanup?;
    private setup;
    constructor();
    protected onSubscribe(): void;
    protected onUnsubscribe(): void;
    setEventListener(setup: SetupFn): void;
    setOnline(online?: boolean): void;
    onOnline(): void;
    isOnline(): boolean;
}
export declare const onlineManager: OnlineManager;
export {};
//# sourceMappingURL=onlineManager.d.ts.map