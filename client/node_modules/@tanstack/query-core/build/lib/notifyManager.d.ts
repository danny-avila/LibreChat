declare type NotifyCallback = () => void;
declare type NotifyFunction = (callback: () => void) => void;
declare type BatchNotifyFunction = (callback: () => void) => void;
declare type BatchCallsCallback<T extends unknown[]> = (...args: T) => void;
export declare function createNotifyManager(): {
    readonly batch: <T>(callback: () => T) => T;
    readonly batchCalls: <T_1 extends unknown[]>(callback: BatchCallsCallback<T_1>) => BatchCallsCallback<T_1>;
    readonly schedule: (callback: NotifyCallback) => void;
    readonly setNotifyFunction: (fn: NotifyFunction) => void;
    readonly setBatchNotifyFunction: (fn: BatchNotifyFunction) => void;
};
export declare const notifyManager: {
    readonly batch: <T>(callback: () => T) => T;
    readonly batchCalls: <T_1 extends unknown[]>(callback: BatchCallsCallback<T_1>) => BatchCallsCallback<T_1>;
    readonly schedule: (callback: NotifyCallback) => void;
    readonly setNotifyFunction: (fn: NotifyFunction) => void;
    readonly setBatchNotifyFunction: (fn: BatchNotifyFunction) => void;
};
export {};
//# sourceMappingURL=notifyManager.d.ts.map