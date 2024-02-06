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
import { BEGIN_DRAG, DROP, END_DRAG, HOVER, PUBLISH_DRAG_SOURCE } from '../actions/dragDrop/index.js';
import { REMOVE_TARGET } from '../actions/registry.js';
import { without } from '../utils/js_utils.js';
const initialState = {
    itemType: null,
    item: null,
    sourceId: null,
    targetIds: [],
    dropResult: null,
    didDrop: false,
    isSourcePublic: null
};
export function reduce(state = initialState, action) {
    const { payload  } = action;
    switch(action.type){
        case BEGIN_DRAG:
            return _objectSpread({}, state, {
                itemType: payload.itemType,
                item: payload.item,
                sourceId: payload.sourceId,
                isSourcePublic: payload.isSourcePublic,
                dropResult: null,
                didDrop: false
            });
        case PUBLISH_DRAG_SOURCE:
            return _objectSpread({}, state, {
                isSourcePublic: true
            });
        case HOVER:
            return _objectSpread({}, state, {
                targetIds: payload.targetIds
            });
        case REMOVE_TARGET:
            if (state.targetIds.indexOf(payload.targetId) === -1) {
                return state;
            }
            return _objectSpread({}, state, {
                targetIds: without(state.targetIds, payload.targetId)
            });
        case DROP:
            return _objectSpread({}, state, {
                dropResult: payload.dropResult,
                didDrop: true,
                targetIds: []
            });
        case END_DRAG:
            return _objectSpread({}, state, {
                itemType: null,
                item: null,
                sourceId: null,
                dropResult: null,
                didDrop: false,
                isSourcePublic: null,
                targetIds: []
            });
        default:
            return state;
    }
}

//# sourceMappingURL=dragOperation.js.map