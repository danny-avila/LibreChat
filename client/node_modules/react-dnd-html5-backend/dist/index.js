import { HTML5BackendImpl } from './HTML5BackendImpl.js';
import * as _NativeTypes from './NativeTypes.js';
export { getEmptyImage } from './getEmptyImage.js';
export { _NativeTypes as NativeTypes };
export const HTML5Backend = function createBackend(manager, context, options) {
    return new HTML5BackendImpl(manager, context, options);
};

//# sourceMappingURL=index.js.map