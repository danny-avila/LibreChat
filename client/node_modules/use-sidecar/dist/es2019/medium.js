function ItoI(a) {
    return a;
}
function innerCreateMedium(defaults, middleware = ItoI) {
    let buffer = [];
    let assigned = false;
    const medium = {
        read() {
            if (assigned) {
                throw new Error('Sidecar: could not `read` from an `assigned` medium. `read` could be used only with `useMedium`.');
            }
            if (buffer.length) {
                return buffer[buffer.length - 1];
            }
            return defaults;
        },
        useMedium(data) {
            const item = middleware(data, assigned);
            buffer.push(item);
            return () => {
                buffer = buffer.filter((x) => x !== item);
            };
        },
        assignSyncMedium(cb) {
            assigned = true;
            while (buffer.length) {
                const cbs = buffer;
                buffer = [];
                cbs.forEach(cb);
            }
            buffer = {
                push: (x) => cb(x),
                filter: () => buffer,
            };
        },
        assignMedium(cb) {
            assigned = true;
            let pendingQueue = [];
            if (buffer.length) {
                const cbs = buffer;
                buffer = [];
                cbs.forEach(cb);
                pendingQueue = buffer;
            }
            const executeQueue = () => {
                const cbs = pendingQueue;
                pendingQueue = [];
                cbs.forEach(cb);
            };
            const cycle = () => Promise.resolve().then(executeQueue);
            cycle();
            buffer = {
                push: (x) => {
                    pendingQueue.push(x);
                    cycle();
                },
                filter: (filter) => {
                    pendingQueue = pendingQueue.filter(filter);
                    return buffer;
                },
            };
        },
    };
    return medium;
}
export function createMedium(defaults, middleware = ItoI) {
    return innerCreateMedium(defaults, middleware);
}
// eslint-disable-next-line @typescript-eslint/ban-types
export function createSidecarMedium(options = {}) {
    const medium = innerCreateMedium(null);
    medium.options = {
        async: true,
        ssr: false,
        ...options,
    };
    return medium;
}
