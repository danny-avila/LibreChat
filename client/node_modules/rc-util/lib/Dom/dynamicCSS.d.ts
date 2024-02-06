export type ContainerType = Element | ShadowRoot;
export type Prepend = boolean | 'queue';
export type AppendType = 'prependQueue' | 'append' | 'prepend';
interface Options {
    attachTo?: ContainerType;
    csp?: {
        nonce?: string;
    };
    prepend?: Prepend;
    /**
     * Config the `priority` of `prependQueue`. Default is `0`.
     * It's useful if you need to insert style before other style.
     */
    priority?: number;
    mark?: string;
}
export declare function injectCSS(css: string, option?: Options): HTMLStyleElement;
export declare function removeCSS(key: string, option?: Options): void;
/**
 * manually clear container cache to avoid global cache in unit testes
 */
export declare function clearContainerCache(): void;
export declare function updateCSS(css: string, key: string, option?: Options): HTMLStyleElement;
export {};
