import { useState, useEffect } from 'react';
import { env } from './env';
var cache = new WeakMap();
var NO_OPTIONS = {};
export function useSidecar(importer, effect) {
    var options = (effect && effect.options) || NO_OPTIONS;
    if (env.isNode && !options.ssr) {
        return [null, null];
    }
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useRealSidecar(importer, effect);
}
function useRealSidecar(importer, effect) {
    var options = (effect && effect.options) || NO_OPTIONS;
    var couldUseCache = env.forceCache || (env.isNode && !!options.ssr) || !options.async;
    var _a = useState(couldUseCache ? function () { return cache.get(importer); } : undefined), Car = _a[0], setCar = _a[1];
    var _b = useState(null), error = _b[0], setError = _b[1];
    useEffect(function () {
        if (!Car) {
            importer().then(function (car) {
                var resolved = effect ? effect.read() : car.default || car;
                if (!resolved) {
                    console.error('Sidecar error: with importer', importer);
                    var error_1;
                    if (effect) {
                        console.error('Sidecar error: with medium', effect);
                        error_1 = new Error('Sidecar medium was not found');
                    }
                    else {
                        error_1 = new Error('Sidecar was not found in exports');
                    }
                    setError(function () { return error_1; });
                    throw error_1;
                }
                cache.set(importer, resolved);
                setCar(function () { return resolved; });
            }, function (e) { return setError(function () { return e; }); });
        }
    }, []);
    return [Car, error];
}
