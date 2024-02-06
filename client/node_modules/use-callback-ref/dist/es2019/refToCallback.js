/**
 * Unmemoized version of {@link useRefToCallback}
 * @see {@link useRefToCallback}
 * @param ref
 */
export function refToCallback(ref) {
    return (newValue) => {
        if (typeof ref === 'function') {
            ref(newValue);
        }
        else if (ref) {
            ref.current = newValue;
        }
    };
}
const nullCallback = () => null;
// lets maintain a weak ref to, well, ref :)
// not using `kashe` to keep this package small
const weakMem = new WeakMap();
const weakMemoize = (ref) => {
    const usedRef = ref || nullCallback;
    const storedRef = weakMem.get(usedRef);
    if (storedRef) {
        return storedRef;
    }
    const cb = refToCallback(usedRef);
    weakMem.set(usedRef, cb);
    return cb;
};
/**
 * Transforms a given `ref` into `callback`.
 *
 * To transform `callback` into ref use {@link useCallbackRef|useCallbackRef(undefined, callback)}
 *
 * @param {ReactRef} ref
 * @returns {Function}
 *
 * @see https://github.com/theKashey/use-callback-ref#reftocallback
 *
 * @example
 * const ref = useRef(0);
 * const setRef = useRefToCallback(ref);
 * 👉 setRef(10);
 * ✅ ref.current === 10
 */
export function useRefToCallback(ref) {
    return weakMemoize(ref);
}
