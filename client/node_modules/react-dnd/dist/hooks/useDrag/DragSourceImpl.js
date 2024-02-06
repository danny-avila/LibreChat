export class DragSourceImpl {
    beginDrag() {
        const spec = this.spec;
        const monitor = this.monitor;
        let result = null;
        if (typeof spec.item === 'object') {
            result = spec.item;
        } else if (typeof spec.item === 'function') {
            result = spec.item(monitor);
        } else {
            result = {};
        }
        return result !== null && result !== void 0 ? result : null;
    }
    canDrag() {
        const spec = this.spec;
        const monitor = this.monitor;
        if (typeof spec.canDrag === 'boolean') {
            return spec.canDrag;
        } else if (typeof spec.canDrag === 'function') {
            return spec.canDrag(monitor);
        } else {
            return true;
        }
    }
    isDragging(globalMonitor, target) {
        const spec = this.spec;
        const monitor = this.monitor;
        const { isDragging  } = spec;
        return isDragging ? isDragging(monitor) : target === globalMonitor.getSourceId();
    }
    endDrag() {
        const spec = this.spec;
        const monitor = this.monitor;
        const connector = this.connector;
        const { end  } = spec;
        if (end) {
            end(monitor.getItem(), monitor);
        }
        connector.reconnect();
    }
    constructor(spec, monitor, connector){
        this.spec = spec;
        this.monitor = monitor;
        this.connector = connector;
    }
}

//# sourceMappingURL=DragSourceImpl.js.map