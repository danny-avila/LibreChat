import { useMemo } from 'react';
import { TargetConnector } from '../../internals/index.js';
import { useDragDropManager } from '../useDragDropManager.js';
import { useIsomorphicLayoutEffect } from '../useIsomorphicLayoutEffect.js';
export function useDropTargetConnector(options) {
    const manager = useDragDropManager();
    const connector = useMemo(()=>new TargetConnector(manager.getBackend())
    , [
        manager
    ]);
    useIsomorphicLayoutEffect(()=>{
        connector.dropTargetOptions = options || null;
        connector.reconnect();
        return ()=>connector.disconnectDropTarget()
        ;
    }, [
        options
    ]);
    return connector;
}

//# sourceMappingURL=useDropTargetConnector.js.map