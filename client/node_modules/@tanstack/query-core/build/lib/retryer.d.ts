import type { CancelOptions, NetworkMode } from './types';
interface RetryerConfig<TData = unknown, TError = unknown> {
    fn: () => TData | Promise<TData>;
    abort?: () => void;
    onError?: (error: TError) => void;
    onSuccess?: (data: TData) => void;
    onFail?: (failureCount: number, error: TError) => void;
    onPause?: () => void;
    onContinue?: () => void;
    retry?: RetryValue<TError>;
    retryDelay?: RetryDelayValue<TError>;
    networkMode: NetworkMode | undefined;
}
export interface Retryer<TData = unknown> {
    promise: Promise<TData>;
    cancel: (cancelOptions?: CancelOptions) => void;
    continue: () => Promise<unknown>;
    cancelRetry: () => void;
    continueRetry: () => void;
}
export declare type RetryValue<TError> = boolean | number | ShouldRetryFunction<TError>;
declare type ShouldRetryFunction<TError> = (failureCount: number, error: TError) => boolean;
export declare type RetryDelayValue<TError> = number | RetryDelayFunction<TError>;
declare type RetryDelayFunction<TError = unknown> = (failureCount: number, error: TError) => number;
export declare function canFetch(networkMode: NetworkMode | undefined): boolean;
export declare class CancelledError {
    revert?: boolean;
    silent?: boolean;
    constructor(options?: CancelOptions);
}
export declare function isCancelledError(value: any): value is CancelledError;
export declare function createRetryer<TData = unknown, TError = unknown>(config: RetryerConfig<TData, TError>): Retryer<TData>;
export {};
//# sourceMappingURL=retryer.d.ts.map