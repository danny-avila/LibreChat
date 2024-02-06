// cheap lodash replacements
export function memoize(fn) {
    let result = null;
    const memoized = ()=>{
        if (result == null) {
            result = fn();
        }
        return result;
    };
    return memoized;
}
/**
 * drop-in replacement for _.without
 */ export function without(items, item) {
    return items.filter((i)=>i !== item
    );
}
export function union(itemsA, itemsB) {
    const set = new Set();
    const insertItem = (item)=>set.add(item)
    ;
    itemsA.forEach(insertItem);
    itemsB.forEach(insertItem);
    const result = [];
    set.forEach((key)=>result.push(key)
    );
    return result;
}

//# sourceMappingURL=js_utils.js.map