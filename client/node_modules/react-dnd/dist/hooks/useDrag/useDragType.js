import { invariant } from '@react-dnd/invariant';
import { useMemo } from 'react';
export function useDragType(spec) {
    return useMemo(()=>{
        const result = spec.type;
        invariant(result != null, 'spec.type must be defined');
        return result;
    }, [
        spec
    ]);
}

//# sourceMappingURL=useDragType.js.map