function _defineProperty(obj, key, value) {
    if (key in obj) {
        Object.defineProperty(obj, key, {
            value: value,
            enumerable: true,
            configurable: true,
            writable: true
        });
    } else {
        obj[key] = value;
    }
    return obj;
}
function _objectSpread(target) {
    for(var i = 1; i < arguments.length; i++){
        var source = arguments[i] != null ? arguments[i] : {};
        var ownKeys = Object.keys(source);
        if (typeof Object.getOwnPropertySymbols === 'function') {
            ownKeys = ownKeys.concat(Object.getOwnPropertySymbols(source).filter(function(sym) {
                return Object.getOwnPropertyDescriptor(source, sym).enumerable;
            }));
        }
        ownKeys.forEach(function(key) {
            _defineProperty(target, key, source[key]);
        });
    }
    return target;
}
import { get } from '../utils/js_utils.js';
import { reduce as dirtyHandlerIds } from './dirtyHandlerIds.js';
import { reduce as dragOffset } from './dragOffset.js';
import { reduce as dragOperation } from './dragOperation.js';
import { reduce as refCount } from './refCount.js';
import { reduce as stateId } from './stateId.js';
export function reduce(state = {}, action) {
    return {
        dirtyHandlerIds: dirtyHandlerIds(state.dirtyHandlerIds, {
            type: action.type,
            payload: _objectSpread({}, action.payload, {
                prevTargetIds: get(state, 'dragOperation.targetIds', [])
            })
        }),
        dragOffset: dragOffset(state.dragOffset, action),
        refCount: refCount(state.refCount, action),
        dragOperation: dragOperation(state.dragOperation, action),
        stateId: stateId(state.stateId)
    };
}

//# sourceMappingURL=index.js.map