import { isMap, isArray, isPlainObject, isSet } from './is';
import { includes } from './util';
var getNthKey = function (value, n) {
    var keys = value.keys();
    while (n > 0) {
        keys.next();
        n--;
    }
    return keys.next().value;
};
function validatePath(path) {
    if (includes(path, '__proto__')) {
        throw new Error('__proto__ is not allowed as a property');
    }
    if (includes(path, 'prototype')) {
        throw new Error('prototype is not allowed as a property');
    }
    if (includes(path, 'constructor')) {
        throw new Error('constructor is not allowed as a property');
    }
}
export var getDeep = function (object, path) {
    validatePath(path);
    for (var i = 0; i < path.length; i++) {
        var key = path[i];
        if (isSet(object)) {
            object = getNthKey(object, +key);
        }
        else if (isMap(object)) {
            var row = +key;
            var type = +path[++i] === 0 ? 'key' : 'value';
            var keyOfRow = getNthKey(object, row);
            switch (type) {
                case 'key':
                    object = keyOfRow;
                    break;
                case 'value':
                    object = object.get(keyOfRow);
                    break;
            }
        }
        else {
            object = object[key];
        }
    }
    return object;
};
export var setDeep = function (object, path, mapper) {
    validatePath(path);
    if (path.length === 0) {
        return mapper(object);
    }
    var parent = object;
    for (var i = 0; i < path.length - 1; i++) {
        var key = path[i];
        if (isArray(parent)) {
            var index = +key;
            parent = parent[index];
        }
        else if (isPlainObject(parent)) {
            parent = parent[key];
        }
        else if (isSet(parent)) {
            var row = +key;
            parent = getNthKey(parent, row);
        }
        else if (isMap(parent)) {
            var isEnd = i === path.length - 2;
            if (isEnd) {
                break;
            }
            var row = +key;
            var type = +path[++i] === 0 ? 'key' : 'value';
            var keyOfRow = getNthKey(parent, row);
            switch (type) {
                case 'key':
                    parent = keyOfRow;
                    break;
                case 'value':
                    parent = parent.get(keyOfRow);
                    break;
            }
        }
    }
    var lastKey = path[path.length - 1];
    if (isArray(parent)) {
        parent[+lastKey] = mapper(parent[+lastKey]);
    }
    else if (isPlainObject(parent)) {
        parent[lastKey] = mapper(parent[lastKey]);
    }
    if (isSet(parent)) {
        var oldValue = getNthKey(parent, +lastKey);
        var newValue = mapper(oldValue);
        if (oldValue !== newValue) {
            parent["delete"](oldValue);
            parent.add(newValue);
        }
    }
    if (isMap(parent)) {
        var row = +path[path.length - 2];
        var keyToRow = getNthKey(parent, row);
        var type = +lastKey === 0 ? 'key' : 'value';
        switch (type) {
            case 'key': {
                var newKey = mapper(keyToRow);
                parent.set(newKey, parent.get(keyToRow));
                if (newKey !== keyToRow) {
                    parent["delete"](keyToRow);
                }
                break;
            }
            case 'value': {
                parent.set(keyToRow, mapper(parent.get(keyToRow)));
                break;
            }
        }
    }
    return object;
};
//# sourceMappingURL=accessDeep.js.map