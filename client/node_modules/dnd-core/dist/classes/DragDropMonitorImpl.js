import { invariant } from '@react-dnd/invariant';
import { getDifferenceFromInitialOffset, getSourceClientOffset } from '../utils/coords.js';
import { areDirty } from '../utils/dirtiness.js';
import { matchesType } from '../utils/matchesType.js';
export class DragDropMonitorImpl {
    subscribeToStateChange(listener, options = {}) {
        const { handlerIds  } = options;
        invariant(typeof listener === 'function', 'listener must be a function.');
        invariant(typeof handlerIds === 'undefined' || Array.isArray(handlerIds), 'handlerIds, when specified, must be an array of strings.');
        let prevStateId = this.store.getState().stateId;
        const handleChange = ()=>{
            const state = this.store.getState();
            const currentStateId = state.stateId;
            try {
                const canSkipListener = currentStateId === prevStateId || currentStateId === prevStateId + 1 && !areDirty(state.dirtyHandlerIds, handlerIds);
                if (!canSkipListener) {
                    listener();
                }
            } finally{
                prevStateId = currentStateId;
            }
        };
        return this.store.subscribe(handleChange);
    }
    subscribeToOffsetChange(listener) {
        invariant(typeof listener === 'function', 'listener must be a function.');
        let previousState = this.store.getState().dragOffset;
        const handleChange = ()=>{
            const nextState = this.store.getState().dragOffset;
            if (nextState === previousState) {
                return;
            }
            previousState = nextState;
            listener();
        };
        return this.store.subscribe(handleChange);
    }
    canDragSource(sourceId) {
        if (!sourceId) {
            return false;
        }
        const source = this.registry.getSource(sourceId);
        invariant(source, `Expected to find a valid source. sourceId=${sourceId}`);
        if (this.isDragging()) {
            return false;
        }
        return source.canDrag(this, sourceId);
    }
    canDropOnTarget(targetId) {
        // undefined on initial render
        if (!targetId) {
            return false;
        }
        const target = this.registry.getTarget(targetId);
        invariant(target, `Expected to find a valid target. targetId=${targetId}`);
        if (!this.isDragging() || this.didDrop()) {
            return false;
        }
        const targetType = this.registry.getTargetType(targetId);
        const draggedItemType = this.getItemType();
        return matchesType(targetType, draggedItemType) && target.canDrop(this, targetId);
    }
    isDragging() {
        return Boolean(this.getItemType());
    }
    isDraggingSource(sourceId) {
        // undefined on initial render
        if (!sourceId) {
            return false;
        }
        const source = this.registry.getSource(sourceId, true);
        invariant(source, `Expected to find a valid source. sourceId=${sourceId}`);
        if (!this.isDragging() || !this.isSourcePublic()) {
            return false;
        }
        const sourceType = this.registry.getSourceType(sourceId);
        const draggedItemType = this.getItemType();
        if (sourceType !== draggedItemType) {
            return false;
        }
        return source.isDragging(this, sourceId);
    }
    isOverTarget(targetId, options = {
        shallow: false
    }) {
        // undefined on initial render
        if (!targetId) {
            return false;
        }
        const { shallow  } = options;
        if (!this.isDragging()) {
            return false;
        }
        const targetType = this.registry.getTargetType(targetId);
        const draggedItemType = this.getItemType();
        if (draggedItemType && !matchesType(targetType, draggedItemType)) {
            return false;
        }
        const targetIds = this.getTargetIds();
        if (!targetIds.length) {
            return false;
        }
        const index = targetIds.indexOf(targetId);
        if (shallow) {
            return index === targetIds.length - 1;
        } else {
            return index > -1;
        }
    }
    getItemType() {
        return this.store.getState().dragOperation.itemType;
    }
    getItem() {
        return this.store.getState().dragOperation.item;
    }
    getSourceId() {
        return this.store.getState().dragOperation.sourceId;
    }
    getTargetIds() {
        return this.store.getState().dragOperation.targetIds;
    }
    getDropResult() {
        return this.store.getState().dragOperation.dropResult;
    }
    didDrop() {
        return this.store.getState().dragOperation.didDrop;
    }
    isSourcePublic() {
        return Boolean(this.store.getState().dragOperation.isSourcePublic);
    }
    getInitialClientOffset() {
        return this.store.getState().dragOffset.initialClientOffset;
    }
    getInitialSourceClientOffset() {
        return this.store.getState().dragOffset.initialSourceClientOffset;
    }
    getClientOffset() {
        return this.store.getState().dragOffset.clientOffset;
    }
    getSourceClientOffset() {
        return getSourceClientOffset(this.store.getState().dragOffset);
    }
    getDifferenceFromInitialOffset() {
        return getDifferenceFromInitialOffset(this.store.getState().dragOffset);
    }
    constructor(store, registry){
        this.store = store;
        this.registry = registry;
    }
}

//# sourceMappingURL=DragDropMonitorImpl.js.map