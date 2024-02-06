export interface scrollLockOptions {
    container: HTMLElement;
}
export default class ScrollLocker {
    private lockTarget;
    private options;
    constructor(options?: scrollLockOptions);
    getContainer: () => HTMLElement | undefined;
    reLock: (options?: scrollLockOptions) => void;
    lock: () => void;
    unLock: () => void;
}
