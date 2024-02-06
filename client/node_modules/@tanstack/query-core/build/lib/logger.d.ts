export interface Logger {
    log: LogFunction;
    warn: LogFunction;
    error: LogFunction;
}
declare type LogFunction = (...args: any[]) => void;
export declare const defaultLogger: Logger;
export {};
//# sourceMappingURL=logger.d.ts.map