import { PUBLISH_DRAG_SOURCE } from './types.js';
export function createPublishDragSource(manager) {
    return function publishDragSource() {
        const monitor = manager.getMonitor();
        if (monitor.isDragging()) {
            return {
                type: PUBLISH_DRAG_SOURCE
            };
        }
        return;
    };
}

//# sourceMappingURL=publishDragSource.js.map