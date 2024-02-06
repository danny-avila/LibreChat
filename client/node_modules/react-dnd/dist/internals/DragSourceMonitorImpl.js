import { invariant } from '@react-dnd/invariant';
let isCallingCanDrag = false;
let isCallingIsDragging = false;
export class DragSourceMonitorImpl {
    receiveHandlerId(sourceId) {
        this.sourceId = sourceId;
    }
    getHandlerId() {
        return this.sourceId;
    }
    canDrag() {
        invariant(!isCallingCanDrag, 'You may not call monitor.canDrag() inside your canDrag() implementation. ' + 'Read more: http://react-dnd.github.io/react-dnd/docs/api/drag-source-monitor');
        try {
            isCallingCanDrag = true;
            return this.internalMonitor.canDragSource(this.sourceId);
        } finally{
            isCallingCanDrag = false;
        }
    }
    isDragging() {
        if (!this.sourceId) {
            return false;
        }
        invariant(!isCallingIsDragging, 'You may not call monitor.isDragging() inside your isDragging() implementation. ' + 'Read more: http://react-dnd.github.io/react-dnd/docs/api/drag-source-monitor');
        try {
            isCallingIsDragging = true;
            return this.internalMonitor.isDraggingSource(this.sourceId);
        } finally{
            isCallingIsDragging = false;
        }
    }
    subscribeToStateChange(listener, options) {
        return this.internalMonitor.subscribeToStateChange(listener, options);
    }
    isDraggingSource(sourceId) {
        return this.internalMonitor.isDraggingSource(sourceId);
    }
    isOverTarget(targetId, options) {
        return this.internalMonitor.isOverTarget(targetId, options);
    }
    getTargetIds() {
        return this.internalMonitor.getTargetIds();
    }
    isSourcePublic() {
        return this.internalMonitor.isSourcePublic();
    }
    getSourceId() {
        return this.internalMonitor.getSourceId();
    }
    subscribeToOffsetChange(listener) {
        return this.internalMonitor.subscribeToOffsetChange(listener);
    }
    canDragSource(sourceId) {
        return this.internalMonitor.canDragSource(sourceId);
    }
    canDropOnTarget(targetId) {
        return this.internalMonitor.canDropOnTarget(targetId);
    }
    getItemType() {
        return this.internalMonitor.getItemType();
    }
    getItem() {
        return this.internalMonitor.getItem();
    }
    getDropResult() {
        return this.internalMonitor.getDropResult();
    }
    didDrop() {
        return this.internalMonitor.didDrop();
    }
    getInitialClientOffset() {
        return this.internalMonitor.getInitialClientOffset();
    }
    getInitialSourceClientOffset() {
        return this.internalMonitor.getInitialSourceClientOffset();
    }
    getSourceClientOffset() {
        return this.internalMonitor.getSourceClientOffset();
    }
    getClientOffset() {
        return this.internalMonitor.getClientOffset();
    }
    getDifferenceFromInitialOffset() {
        return this.internalMonitor.getDifferenceFromInitialOffset();
    }
    constructor(manager){
        this.sourceId = null;
        this.internalMonitor = manager.getMonitor();
    }
}

//# sourceMappingURL=DragSourceMonitorImpl.js.map