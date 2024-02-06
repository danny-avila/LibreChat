import { useMemo } from 'react';
export function useConnectDropTarget(connector) {
    return useMemo(()=>connector.hooks.dropTarget()
    , [
        connector
    ]);
}

//# sourceMappingURL=connectors.js.map