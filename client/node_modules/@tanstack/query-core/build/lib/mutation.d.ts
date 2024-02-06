import { Removable } from './removable';
import type { MutationMeta, MutationOptions, MutationStatus } from './types';
import type { MutationCache } from './mutationCache';
import type { MutationObserver } from './mutationObserver';
import type { Logger } from './logger';
interface MutationConfig<TData, TError, TVariables, TContext> {
    mutationId: number;
    mutationCache: MutationCache;
    options: MutationOptions<TData, TError, TVariables, TContext>;
    logger?: Logger;
    defaultOptions?: MutationOptions<TData, TError, TVariables, TContext>;
    state?: MutationState<TData, TError, TVariables, TContext>;
    meta?: MutationMeta;
}
export interface MutationState<TData = unknown, TError = unknown, TVariables = void, TContext = unknown> {
    context: TContext | undefined;
    data: TData | undefined;
    error: TError | null;
    failureCount: number;
    failureReason: TError | null;
    isPaused: boolean;
    status: MutationStatus;
    variables: TVariables | undefined;
}
interface FailedAction<TError> {
    type: 'failed';
    failureCount: number;
    error: TError | null;
}
interface LoadingAction<TVariables, TContext> {
    type: 'loading';
    variables?: TVariables;
    context?: TContext;
}
interface SuccessAction<TData> {
    type: 'success';
    data: TData;
}
interface ErrorAction<TError> {
    type: 'error';
    error: TError;
}
interface PauseAction {
    type: 'pause';
}
interface ContinueAction {
    type: 'continue';
}
interface SetStateAction<TData, TError, TVariables, TContext> {
    type: 'setState';
    state: MutationState<TData, TError, TVariables, TContext>;
}
export declare type Action<TData, TError, TVariables, TContext> = ContinueAction | ErrorAction<TError> | FailedAction<TError> | LoadingAction<TVariables, TContext> | PauseAction | SetStateAction<TData, TError, TVariables, TContext> | SuccessAction<TData>;
export declare class Mutation<TData = unknown, TError = unknown, TVariables = void, TContext = unknown> extends Removable {
    state: MutationState<TData, TError, TVariables, TContext>;
    options: MutationOptions<TData, TError, TVariables, TContext>;
    mutationId: number;
    private observers;
    private defaultOptions?;
    private mutationCache;
    private logger;
    private retryer?;
    constructor(config: MutationConfig<TData, TError, TVariables, TContext>);
    setOptions(options?: MutationOptions<TData, TError, TVariables, TContext>): void;
    get meta(): MutationMeta | undefined;
    setState(state: MutationState<TData, TError, TVariables, TContext>): void;
    addObserver(observer: MutationObserver<any, any, any, any>): void;
    removeObserver(observer: MutationObserver<any, any, any, any>): void;
    protected optionalRemove(): void;
    continue(): Promise<unknown>;
    execute(): Promise<TData>;
    private dispatch;
}
export declare function getDefaultState<TData, TError, TVariables, TContext>(): MutationState<TData, TError, TVariables, TContext>;
export {};
//# sourceMappingURL=mutation.d.ts.map