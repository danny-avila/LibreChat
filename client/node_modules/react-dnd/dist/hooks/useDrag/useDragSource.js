import { useEffect, useMemo } from 'react';
import { DragSourceImpl } from './DragSourceImpl.js';
export function useDragSource(spec, monitor, connector) {
    const handler = useMemo(()=>new DragSourceImpl(spec, monitor, connector)
    , [
        monitor,
        connector
    ]);
    useEffect(()=>{
        handler.spec = spec;
    }, [
        spec
    ]);
    return handler;
}

//# sourceMappingURL=useDragSource.js.map