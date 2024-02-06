import equal from 'fast-deep-equal';
import { useCallback, useState } from 'react';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect.js';
/**
 *
 * @param monitor The monitor to collect state from
 * @param collect The collecting function
 * @param onUpdate A method to invoke when updates occur
 */ export function useCollector(monitor, collect, onUpdate) {
    const [collected, setCollected] = useState(()=>collect(monitor)
    );
    const updateCollected = useCallback(()=>{
        const nextValue = collect(monitor);
        // This needs to be a deep-equality check because some monitor-collected values
        // include XYCoord objects that may be equivalent, but do not have instance equality.
        if (!equal(collected, nextValue)) {
            setCollected(nextValue);
            if (onUpdate) {
                onUpdate();
            }
        }
    }, [
        collected,
        monitor,
        onUpdate
    ]);
    // update the collected properties after react renders.
    // Note that the "Dustbin Stress Test" fails if this is not
    // done when the component updates
    useIsomorphicLayoutEffect(updateCollected);
    return [
        collected,
        updateCollected
    ];
}

//# sourceMappingURL=useCollector.js.map