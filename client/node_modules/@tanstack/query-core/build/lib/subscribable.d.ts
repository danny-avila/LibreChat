declare type Listener = () => void;
export declare class Subscribable<TListener extends Function = Listener> {
    protected listeners: Set<{
        listener: TListener;
    }>;
    constructor();
    subscribe(listener: TListener): () => void;
    hasListeners(): boolean;
    protected onSubscribe(): void;
    protected onUnsubscribe(): void;
}
export {};
//# sourceMappingURL=subscribable.d.ts.map