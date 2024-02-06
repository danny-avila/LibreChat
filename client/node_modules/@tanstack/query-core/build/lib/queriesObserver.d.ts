import { QueryObserver } from './queryObserver';
import { Subscribable } from './subscribable';
import type { QueryObserverOptions, QueryObserverResult } from './types';
import type { QueryClient } from './queryClient';
import type { NotifyOptions } from './queryObserver';
declare type QueriesObserverListener = (result: QueryObserverResult[]) => void;
export declare class QueriesObserver extends Subscribable<QueriesObserverListener> {
    private client;
    private result;
    private queries;
    private observers;
    private observersMap;
    constructor(client: QueryClient, queries?: QueryObserverOptions[]);
    protected onSubscribe(): void;
    protected onUnsubscribe(): void;
    destroy(): void;
    setQueries(queries: QueryObserverOptions[], notifyOptions?: NotifyOptions): void;
    getCurrentResult(): QueryObserverResult[];
    getQueries(): import("./query").Query<unknown, unknown, unknown, import("./types").QueryKey>[];
    getObservers(): QueryObserver<unknown, unknown, unknown, unknown, import("./types").QueryKey>[];
    getOptimisticResult(queries: QueryObserverOptions[]): QueryObserverResult[];
    private findMatchingObservers;
    private onUpdate;
    private notify;
}
export {};
//# sourceMappingURL=queriesObserver.d.ts.map