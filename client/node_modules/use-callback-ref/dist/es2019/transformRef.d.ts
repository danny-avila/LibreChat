import { ReactRef, RefObject } from './types';
/**
 * Transforms one ref to another
 * @example
 * ```tsx
 * const ResizableWithRef = forwardRef((props, ref) =>
 *   <Resizable {...props} ref={transformRef(ref, i => i ? i.resizable : null)}/>
 * );
 * ```
 */
export declare function transformRef<T, K>(ref: ReactRef<K>, transformer: (original: T | null) => K): RefObject<T>;
