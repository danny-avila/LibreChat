"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transformRef = void 0;
var assignRef_1 = require("./assignRef");
var createRef_1 = require("./createRef");
/**
 * Transforms one ref to another
 * @example
 * ```tsx
 * const ResizableWithRef = forwardRef((props, ref) =>
 *   <Resizable {...props} ref={transformRef(ref, i => i ? i.resizable : null)}/>
 * );
 * ```
 */
function transformRef(ref, transformer) {
    return (0, createRef_1.createCallbackRef)(function (value) { return (0, assignRef_1.assignRef)(ref, transformer(value)); });
}
exports.transformRef = transformRef;
