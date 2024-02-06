import * as React from 'react';
import { stylesheetSingleton } from './singleton';
/**
 * creates a hook to control style singleton
 * @see {@link styleSingleton} for a safer component version
 * @example
 * ```tsx
 * const useStyle = styleHookSingleton();
 * ///
 * useStyle('body { overflow: hidden}');
 */
export const styleHookSingleton = () => {
    const sheet = stylesheetSingleton();
    return (styles, isDynamic) => {
        React.useEffect(() => {
            sheet.add(styles);
            return () => {
                sheet.remove();
            };
        }, [styles && isDynamic]);
    };
};
