export function registerTarget(type, target, manager) {
    const registry = manager.getRegistry();
    const targetId = registry.addTarget(type, target);
    return [
        targetId,
        ()=>registry.removeTarget(targetId)
    ];
}
export function registerSource(type, source, manager) {
    const registry = manager.getRegistry();
    const sourceId = registry.addSource(type, source);
    return [
        sourceId,
        ()=>registry.removeSource(sourceId)
    ];
}

//# sourceMappingURL=registration.js.map