declare global {
    interface Window extends HTMLElement {
        safari: any;
    }
}
export declare type Predicate = () => boolean;
export declare const isFirefox: Predicate;
export declare const isSafari: Predicate;
