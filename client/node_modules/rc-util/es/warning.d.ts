export type preMessageFn = (message: string, type: 'warning' | 'note') => string | null | undefined | number;
/**
 * Pre warning enable you to parse content before console.error.
 * Modify to null will prevent warning.
 */
export declare const preMessage: (fn: preMessageFn) => void;
export declare function warning(valid: boolean, message: string): void;
export declare function note(valid: boolean, message: string): void;
export declare function resetWarned(): void;
export declare function call(method: (valid: boolean, message: string) => void, valid: boolean, message: string): void;
export declare function warningOnce(valid: boolean, message: string): void;
export declare namespace warningOnce {
    var preMessage: (fn: preMessageFn) => void;
    var resetWarned: typeof import("./warning").resetWarned;
    var noteOnce: typeof import("./warning").noteOnce;
}
export declare function noteOnce(valid: boolean, message: string): void;
export default warningOnce;
