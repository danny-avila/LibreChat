/**
 * creates a style on demand
 */
declare type StyleSingletonHook = (
/**
 * styles to create
 */
styles: string, 
/**
 * indication that styles should be reapplied on change
 */
isDynamic?: boolean) => void;
/**
 * creates a hook to control style singleton
 * @see {@link styleSingleton} for a safer component version
 * @example
 * ```tsx
 * const useStyle = styleHookSingleton();
 * ///
 * useStyle('body { overflow: hidden}');
 */
export declare const styleHookSingleton: () => StyleSingletonHook;
export {};
