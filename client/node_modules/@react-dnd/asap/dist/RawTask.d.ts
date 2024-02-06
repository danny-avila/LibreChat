import type { Task, TaskFn } from 'types';
export declare class RawTask implements Task {
    private onError;
    private release;
    task: TaskFn | null;
    constructor(onError: (err: any) => void, release: (t: RawTask) => void);
    call(): void;
}
