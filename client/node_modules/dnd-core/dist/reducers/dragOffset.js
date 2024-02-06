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
import { BEGIN_DRAG, DROP, END_DRAG, HOVER, INIT_COORDS } from '../actions/dragDrop/index.js';
import { areCoordsEqual } from '../utils/equality.js';
const initialState = {
    initialSourceClientOffset: null,
    initialClientOffset: null,
    clientOffset: null
};
export function reduce(state = initialState, action) {
    const { payload  } = action;
    switch(action.type){
        case INIT_COORDS:
        case BEGIN_DRAG:
            return {
                initialSourceClientOffset: payload.sourceClientOffset,
                initialClientOffset: payload.clientOffset,
                clientOffset: payload.clientOffset
            };
        case HOVER:
            if (areCoordsEqual(state.clientOffset, payload.clientOffset)) {
                return state;
            }
            return _objectSpread({}, state, {
                clientOffset: payload.clientOffset
            });
        case END_DRAG:
        case DROP:
            return initialState;
        default:
            return state;
    }
}

//# sourceMappingURL=dragOffset.js.map