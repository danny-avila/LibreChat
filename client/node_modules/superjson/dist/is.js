"use strict";
exports.__esModule = true;
exports.isURL = exports.isTypedArray = exports.isInfinite = exports.isBigint = exports.isPrimitive = exports.isNaNValue = exports.isError = exports.isDate = exports.isSymbol = exports.isSet = exports.isMap = exports.isRegExp = exports.isBoolean = exports.isNumber = exports.isString = exports.isArray = exports.isEmptyObject = exports.isPlainObject = exports.isNull = exports.isUndefined = void 0;
var getType = function (payload) {
    return Object.prototype.toString.call(payload).slice(8, -1);
};
var isUndefined = function (payload) {
    return typeof payload === 'undefined';
};
exports.isUndefined = isUndefined;
var isNull = function (payload) { return payload === null; };
exports.isNull = isNull;
var isPlainObject = function (payload) {
    if (typeof payload !== 'object' || payload === null)
        return false;
    if (payload === Object.prototype)
        return false;
    if (Object.getPrototypeOf(payload) === null)
        return true;
    return Object.getPrototypeOf(payload) === Object.prototype;
};
exports.isPlainObject = isPlainObject;
var isEmptyObject = function (payload) {
    return exports.isPlainObject(payload) && Object.keys(payload).length === 0;
};
exports.isEmptyObject = isEmptyObject;
var isArray = function (payload) {
    return Array.isArray(payload);
};
exports.isArray = isArray;
var isString = function (payload) {
    return typeof payload === 'string';
};
exports.isString = isString;
var isNumber = function (payload) {
    return typeof payload === 'number' && !isNaN(payload);
};
exports.isNumber = isNumber;
var isBoolean = function (payload) {
    return typeof payload === 'boolean';
};
exports.isBoolean = isBoolean;
var isRegExp = function (payload) {
    return payload instanceof RegExp;
};
exports.isRegExp = isRegExp;
var isMap = function (payload) {
    return payload instanceof Map;
};
exports.isMap = isMap;
var isSet = function (payload) {
    return payload instanceof Set;
};
exports.isSet = isSet;
var isSymbol = function (payload) {
    return getType(payload) === 'Symbol';
};
exports.isSymbol = isSymbol;
var isDate = function (payload) {
    return payload instanceof Date && !isNaN(payload.valueOf());
};
exports.isDate = isDate;
var isError = function (payload) {
    return payload instanceof Error;
};
exports.isError = isError;
var isNaNValue = function (payload) {
    return typeof payload === 'number' && isNaN(payload);
};
exports.isNaNValue = isNaNValue;
var isPrimitive = function (payload) {
    return exports.isBoolean(payload) ||
        exports.isNull(payload) ||
        exports.isUndefined(payload) ||
        exports.isNumber(payload) ||
        exports.isString(payload) ||
        exports.isSymbol(payload);
};
exports.isPrimitive = isPrimitive;
var isBigint = function (payload) {
    return typeof payload === 'bigint';
};
exports.isBigint = isBigint;
var isInfinite = function (payload) {
    return payload === Infinity || payload === -Infinity;
};
exports.isInfinite = isInfinite;
var isTypedArray = function (payload) {
    return ArrayBuffer.isView(payload) && !(payload instanceof DataView);
};
exports.isTypedArray = isTypedArray;
var isURL = function (payload) { return payload instanceof URL; };
exports.isURL = isURL;
//# sourceMappingURL=is.js.map