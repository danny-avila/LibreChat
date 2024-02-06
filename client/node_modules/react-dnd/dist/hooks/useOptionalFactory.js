import { useMemo } from 'react';
export function useOptionalFactory(arg, deps) {
    const memoDeps = [
        ...deps || []
    ];
    if (deps == null && typeof arg !== 'function') {
        memoDeps.push(arg);
    }
    return useMemo(()=>{
        return typeof arg === 'function' ? arg() : arg;
    }, memoDeps);
}

//# sourceMappingURL=useOptionalFactory.js.map