import * as React from 'react';
declare type Props = {
    /**
     * styles to apply
     */
    styles: string;
    /**
     * marks style as dynamic, so it will be reapplied on styles change
     * note: this is not expected behavior from a "singleton"
     * @default false
     */
    dynamic?: boolean;
};
/**
 * create a Component to add styles on demand
 * - styles are added when first instance is mounted
 * - styles are removed when the last instance is unmounted
 * - changing styles in runtime does nothing unless dynamic is set. But with multiple components that can lead to the undefined behavior
 */
export declare const styleSingleton: () => React.FC<Props>;
export {};
