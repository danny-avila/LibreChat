import { registerSource } from '../../internals/index.js';
import { useDragDropManager } from '../useDragDropManager.js';
import { useIsomorphicLayoutEffect } from '../useIsomorphicLayoutEffect.js';
import { useDragSource } from './useDragSource.js';
import { useDragType } from './useDragType.js';
export function useRegisteredDragSource(spec, monitor, connector) {
    const manager = useDragDropManager();
    const handler = useDragSource(spec, monitor, connector);
    const itemType = useDragType(spec);
    useIsomorphicLayoutEffect(function registerDragSource() {
        if (itemType != null) {
            const [handlerId, unregister] = registerSource(itemType, handler, manager);
            monitor.receiveHandlerId(handlerId);
            connector.receiveHandlerId(handlerId);
            return unregister;
        }
        return;
    }, [
        manager,
        monitor,
        connector,
        handler,
        itemType
    ]);
}

//# sourceMappingURL=useRegisteredDragSource.js.map