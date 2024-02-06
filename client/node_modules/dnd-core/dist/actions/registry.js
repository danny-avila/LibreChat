export const ADD_SOURCE = 'dnd-core/ADD_SOURCE';
export const ADD_TARGET = 'dnd-core/ADD_TARGET';
export const REMOVE_SOURCE = 'dnd-core/REMOVE_SOURCE';
export const REMOVE_TARGET = 'dnd-core/REMOVE_TARGET';
export function addSource(sourceId) {
    return {
        type: ADD_SOURCE,
        payload: {
            sourceId
        }
    };
}
export function addTarget(targetId) {
    return {
        type: ADD_TARGET,
        payload: {
            targetId
        }
    };
}
export function removeSource(sourceId) {
    return {
        type: REMOVE_SOURCE,
        payload: {
            sourceId
        }
    };
}
export function removeTarget(targetId) {
    return {
        type: REMOVE_TARGET,
        payload: {
            targetId
        }
    };
}

//# sourceMappingURL=registry.js.map