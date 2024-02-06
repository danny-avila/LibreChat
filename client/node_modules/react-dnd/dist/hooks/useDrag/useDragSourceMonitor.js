import { useMemo } from 'react';
import { DragSourceMonitorImpl } from '../../internals/index.js';
import { useDragDropManager } from '../useDragDropManager.js';
export function useDragSourceMonitor() {
    const manager = useDragDropManager();
    return useMemo(()=>new DragSourceMonitorImpl(manager)
    , [
        manager
    ]);
}

//# sourceMappingURL=useDragSourceMonitor.js.map