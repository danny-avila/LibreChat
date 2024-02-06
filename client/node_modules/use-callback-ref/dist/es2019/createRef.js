/**
 * creates a Ref object with on change callback
 * @param callback
 * @returns {RefObject}
 *
 * @see {@link useCallbackRef}
 * @see https://reactjs.org/docs/refs-and-the-dom.html#creating-refs
 */
export function createCallbackRef(callback) {
    let current = null;
    return {
        get current() {
            return current;
        },
        set current(value) {
            const last = current;
            if (last !== value) {
                current = value;
                callback(value, last);
            }
        },
    };
}
