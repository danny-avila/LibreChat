import * as React from 'react';
import { assignRef } from './assignRef';
import { useCallbackRef } from './useRef';
const currentValues = new WeakMap();
/**
 * Merges two or more refs together providing a single interface to set their value
 * @param {RefObject|Ref} refs
 * @returns {MutableRefObject} - a new ref, which translates all changes to {refs}
 *
 * @see {@link mergeRefs} a version without buit-in memoization
 * @see https://github.com/theKashey/use-callback-ref#usemergerefs
 * @example
 * const Component = React.forwardRef((props, ref) => {
 *   const ownRef = useRef();
 *   const domRef = useMergeRefs([ref, ownRef]); // 👈 merge together
 *   return <div ref={domRef}>...</div>
 * }
 */
export function useMergeRefs(refs, defaultValue) {
    const callbackRef = useCallbackRef(defaultValue || null, (newValue) => refs.forEach((ref) => assignRef(ref, newValue)));
    // handle refs changes - added or removed
    React.useLayoutEffect(() => {
        const oldValue = currentValues.get(callbackRef);
        if (oldValue) {
            const prevRefs = new Set(oldValue);
            const nextRefs = new Set(refs);
            const current = callbackRef.current;
            prevRefs.forEach((ref) => {
                if (!nextRefs.has(ref)) {
                    assignRef(ref, null);
                }
            });
            nextRefs.forEach((ref) => {
                if (!prevRefs.has(ref)) {
                    assignRef(ref, current);
                }
            });
        }
        currentValues.set(callbackRef, refs);
    }, [refs]);
    return callbackRef;
}
