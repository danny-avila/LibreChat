import { useMemo } from 'react';
export function useConnectDragSource(connector) {
    return useMemo(()=>connector.hooks.dragSource()
    , [
        connector
    ]);
}
export function useConnectDragPreview(connector) {
    return useMemo(()=>connector.hooks.dragPreview()
    , [
        connector
    ]);
}

//# sourceMappingURL=connectors.js.map