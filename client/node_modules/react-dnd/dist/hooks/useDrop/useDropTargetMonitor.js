import { useMemo } from 'react';
import { DropTargetMonitorImpl } from '../../internals/index.js';
import { useDragDropManager } from '../useDragDropManager.js';
export function useDropTargetMonitor() {
    const manager = useDragDropManager();
    return useMemo(()=>new DropTargetMonitorImpl(manager)
    , [
        manager
    ]);
}

//# sourceMappingURL=useDropTargetMonitor.js.map