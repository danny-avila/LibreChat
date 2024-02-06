// cheap lodash replacements
/**
 * drop-in replacement for _.get
 * @param obj
 * @param path
 * @param defaultValue
 */ export function get(obj, path, defaultValue) {
    return path.split('.').reduce((a, c)=>a && a[c] ? a[c] : defaultValue || null
    , obj);
}
/**
 * drop-in replacement for _.without
 */ export function without(items, item) {
    return items.filter((i)=>i !== item
    );
}
/**
 * drop-in replacement for _.isString
 * @param input
 */ export function isString(input) {
    return typeof input === 'string';
}
/**
 * drop-in replacement for _.isString
 * @param input
 */ export function isObject(input) {
    return typeof input === 'object';
}
/**
 * replacement for _.xor
 * @param itemsA
 * @param itemsB
 */ export function xor(itemsA, itemsB) {
    const map = new Map();
    const insertItem = (item)=>{
        map.set(item, map.has(item) ? map.get(item) + 1 : 1);
    };
    itemsA.forEach(insertItem);
    itemsB.forEach(insertItem);
    const result = [];
    map.forEach((count, key)=>{
        if (count === 1) {
            result.push(key);
        }
    });
    return result;
}
/**
 * replacement for _.intersection
 * @param itemsA
 * @param itemsB
 */ export function intersection(itemsA, itemsB) {
    return itemsA.filter((t)=>itemsB.indexOf(t) > -1
    );
}

//# sourceMappingURL=js_utils.js.map