var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
function valuesOfObj(record) {
    if ('values' in Object) {
        // eslint-disable-next-line es5/no-es6-methods
        return Object.values(record);
    }
    var values = [];
    // eslint-disable-next-line no-restricted-syntax
    for (var key in record) {
        if (record.hasOwnProperty(key)) {
            values.push(record[key]);
        }
    }
    return values;
}
export function find(record, predicate) {
    var values = valuesOfObj(record);
    if ('find' in values) {
        // eslint-disable-next-line es5/no-es6-methods
        return values.find(predicate);
    }
    var valuesNotNever = values;
    for (var i = 0; i < valuesNotNever.length; i++) {
        var value = valuesNotNever[i];
        if (predicate(value)) {
            return value;
        }
    }
    return undefined;
}
export function forEach(record, run) {
    Object.entries(record).forEach(function (_a) {
        var _b = __read(_a, 2), key = _b[0], value = _b[1];
        return run(value, key);
    });
}
export function includes(arr, value) {
    return arr.indexOf(value) !== -1;
}
export function findArr(record, predicate) {
    for (var i = 0; i < record.length; i++) {
        var value = record[i];
        if (predicate(value)) {
            return value;
        }
    }
    return undefined;
}
//# sourceMappingURL=util.js.map