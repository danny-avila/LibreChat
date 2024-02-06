import type { Task } from './types.js';
export declare class AsapQueue {
    private queue;
    private pendingErrors;
    private flushing;
    private requestFlush;
    private requestErrorThrow;
    private index;
    private capacity;
    constructor();
    enqueueTask(task: Task): void;
    private flush;
    registerPendingError: (err: any) => void;
}
