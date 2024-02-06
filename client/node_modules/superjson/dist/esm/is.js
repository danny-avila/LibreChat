var getType = function (payload) {
    return Object.prototype.toString.call(payload).slice(8, -1);
};
export var isUndefined = function (payload) {
    return typeof payload === 'undefined';
};
export var isNull = function (payload) { return payload === null; };
export var isPlainObject = function (payload) {
    if (typeof payload !== 'object' || payload === null)
        return false;
    if (payload === Object.prototype)
        return false;
    if (Object.getPrototypeOf(payload) === null)
        return true;
    return Object.getPrototypeOf(payload) === Object.prototype;
};
export var isEmptyObject = function (payload) {
    return isPlainObject(payload) && Object.keys(payload).length === 0;
};
export var isArray = function (payload) {
    return Array.isArray(payload);
};
export var isString = function (payload) {
    return typeof payload === 'string';
};
export var isNumber = function (payload) {
    return typeof payload === 'number' && !isNaN(payload);
};
export var isBoolean = function (payload) {
    return typeof payload === 'boolean';
};
export var isRegExp = function (payload) {
    return payload instanceof RegExp;
};
export var isMap = function (payload) {
    return payload instanceof Map;
};
export var isSet = function (payload) {
    return payload instanceof Set;
};
export var isSymbol = function (payload) {
    return getType(payload) === 'Symbol';
};
export var isDate = function (payload) {
    return payload instanceof Date && !isNaN(payload.valueOf());
};
export var isError = function (payload) {
    return payload instanceof Error;
};
export var isNaNValue = function (payload) {
    return typeof payload === 'number' && isNaN(payload);
};
export var isPrimitive = function (payload) {
    return isBoolean(payload) ||
        isNull(payload) ||
        isUndefined(payload) ||
        isNumber(payload) ||
        isString(payload) ||
        isSymbol(payload);
};
export var isBigint = function (payload) {
    return typeof payload === 'bigint';
};
export var isInfinite = function (payload) {
    return payload === Infinity || payload === -Infinity;
};
export var isTypedArray = function (payload) {
    return ArrayBuffer.isView(payload) && !(payload instanceof DataView);
};
export var isURL = function (payload) { return payload instanceof URL; };
//# sourceMappingURL=is.js.map