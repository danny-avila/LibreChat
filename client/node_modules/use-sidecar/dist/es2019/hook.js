import { useState, useEffect } from 'react';
import { env } from './env';
const cache = new WeakMap();
const NO_OPTIONS = {};
export function useSidecar(importer, effect) {
    const options = (effect && effect.options) || NO_OPTIONS;
    if (env.isNode && !options.ssr) {
        return [null, null];
    }
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useRealSidecar(importer, effect);
}
function useRealSidecar(importer, effect) {
    const options = (effect && effect.options) || NO_OPTIONS;
    const couldUseCache = env.forceCache || (env.isNode && !!options.ssr) || !options.async;
    const [Car, setCar] = useState(couldUseCache ? () => cache.get(importer) : undefined);
    const [error, setError] = useState(null);
    useEffect(() => {
        if (!Car) {
            importer().then((car) => {
                const resolved = effect ? effect.read() : car.default || car;
                if (!resolved) {
                    console.error('Sidecar error: with importer', importer);
                    let error;
                    if (effect) {
                        console.error('Sidecar error: with medium', effect);
                        error = new Error('Sidecar medium was not found');
                    }
                    else {
                        error = new Error('Sidecar was not found in exports');
                    }
                    setError(() => error);
                    throw error;
                }
                cache.set(importer, resolved);
                setCar(() => resolved);
            }, (e) => setError(() => e));
        }
    }, []);
    return [Car, error];
}
