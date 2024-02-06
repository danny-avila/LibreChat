import type { HTML5BackendContext, HTML5BackendOptions } from './types.js';
export declare class OptionsReader {
    ownerDocument: Document | null;
    private globalContext;
    private optionsArgs;
    constructor(globalContext: HTML5BackendContext, options?: HTML5BackendOptions);
    get window(): Window | undefined;
    get document(): Document | undefined;
    get rootElement(): Node | undefined;
}
