function _objectWithoutProperties(source, excluded) {
    if (source == null) return {};
    var target = _objectWithoutPropertiesLoose(source, excluded);
    var key, i;
    if (Object.getOwnPropertySymbols) {
        var sourceSymbolKeys = Object.getOwnPropertySymbols(source);
        for(i = 0; i < sourceSymbolKeys.length; i++){
            key = sourceSymbolKeys[i];
            if (excluded.indexOf(key) >= 0) continue;
            if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue;
            target[key] = source[key];
        }
    }
    return target;
}
function _objectWithoutPropertiesLoose(source, excluded) {
    if (source == null) return {};
    var target = {};
    var sourceKeys = Object.keys(source);
    var key, i;
    for(i = 0; i < sourceKeys.length; i++){
        key = sourceKeys[i];
        if (excluded.indexOf(key) >= 0) continue;
        target[key] = source[key];
    }
    return target;
}
import { jsx as _jsx } from "react/jsx-runtime";
import { createDragDropManager } from 'dnd-core';
import { memo, useEffect } from 'react';
import { DndContext } from './DndContext.js';
let refCount = 0;
const INSTANCE_SYM = Symbol.for('__REACT_DND_CONTEXT_INSTANCE__');
var DndProvider = /*#__PURE__*/ memo(function DndProvider(_param) {
    var { children  } = _param, props = _objectWithoutProperties(_param, [
        "children"
    ]);
    const [manager, isGlobalInstance] = getDndContextValue(props) // memoized from props
    ;
    /**
		 * If the global context was used to store the DND context
		 * then where theres no more references to it we should
		 * clean it up to avoid memory leaks
		 */ useEffect(()=>{
        if (isGlobalInstance) {
            const context = getGlobalContext();
            ++refCount;
            return ()=>{
                if (--refCount === 0) {
                    context[INSTANCE_SYM] = null;
                }
            };
        }
        return;
    }, []);
    return /*#__PURE__*/ _jsx(DndContext.Provider, {
        value: manager,
        children: children
    });
});
/**
 * A React component that provides the React-DnD context
 */ export { DndProvider,  };
function getDndContextValue(props) {
    if ('manager' in props) {
        const manager = {
            dragDropManager: props.manager
        };
        return [
            manager,
            false
        ];
    }
    const manager = createSingletonDndContext(props.backend, props.context, props.options, props.debugMode);
    const isGlobalInstance = !props.context;
    return [
        manager,
        isGlobalInstance
    ];
}
function createSingletonDndContext(backend, context = getGlobalContext(), options, debugMode) {
    const ctx = context;
    if (!ctx[INSTANCE_SYM]) {
        ctx[INSTANCE_SYM] = {
            dragDropManager: createDragDropManager(backend, context, options, debugMode)
        };
    }
    return ctx[INSTANCE_SYM];
}
function getGlobalContext() {
    return typeof global !== 'undefined' ? global : window;
}

//# sourceMappingURL=DndProvider.js.map