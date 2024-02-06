import { registerTarget } from '../../internals/index.js';
import { useDragDropManager } from '../useDragDropManager.js';
import { useIsomorphicLayoutEffect } from '../useIsomorphicLayoutEffect.js';
import { useAccept } from './useAccept.js';
import { useDropTarget } from './useDropTarget.js';
export function useRegisteredDropTarget(spec, monitor, connector) {
    const manager = useDragDropManager();
    const dropTarget = useDropTarget(spec, monitor);
    const accept = useAccept(spec);
    useIsomorphicLayoutEffect(function registerDropTarget() {
        const [handlerId, unregister] = registerTarget(accept, dropTarget, manager);
        monitor.receiveHandlerId(handlerId);
        connector.receiveHandlerId(handlerId);
        return unregister;
    }, [
        manager,
        monitor,
        dropTarget,
        connector,
        accept.map((a)=>a.toString()
        ).join('|'), 
    ]);
}

//# sourceMappingURL=useRegisteredDropTarget.js.map