export declare function makeRequestCallFromTimer(callback: () => void): () => void;
export declare function makeRequestCallFromMutationObserver(callback: () => void): () => void;
export declare const makeRequestCall: typeof makeRequestCallFromMutationObserver;
