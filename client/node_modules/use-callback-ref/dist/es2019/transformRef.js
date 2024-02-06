import { assignRef } from './assignRef';
import { createCallbackRef } from './createRef';
/**
 * Transforms one ref to another
 * @example
 * ```tsx
 * const ResizableWithRef = forwardRef((props, ref) =>
 *   <Resizable {...props} ref={transformRef(ref, i => i ? i.resizable : null)}/>
 * );
 * ```
 */
export function transformRef(ref, transformer) {
    return createCallbackRef((value) => assignRef(ref, transformer(value)));
}
