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
var __spreadArray = (this && this.__spreadArray) || function (to, from) {
    for (var i = 0, il = from.length, j = to.length; i < il; i++, j++)
        to[j] = from[i];
    return to;
};
import { isArray, isEmptyObject, isMap, isPlainObject, isPrimitive, isSet, } from './is';
import { escapeKey, stringifyPath } from './pathstringifier';
import { isInstanceOfRegisteredClass, transformValue, untransformValue, } from './transformer';
import { includes, forEach } from './util';
import { parsePath } from './pathstringifier';
import { getDeep, setDeep } from './accessDeep';
function traverse(tree, walker, origin) {
    if (origin === void 0) { origin = []; }
    if (!tree) {
        return;
    }
    if (!isArray(tree)) {
        forEach(tree, function (subtree, key) {
            return traverse(subtree, walker, __spreadArray(__spreadArray([], __read(origin)), __read(parsePath(key))));
        });
        return;
    }
    var _a = __read(tree, 2), nodeValue = _a[0], children = _a[1];
    if (children) {
        forEach(children, function (child, key) {
            traverse(child, walker, __spreadArray(__spreadArray([], __read(origin)), __read(parsePath(key))));
        });
    }
    walker(nodeValue, origin);
}
export function applyValueAnnotations(plain, annotations, superJson) {
    traverse(annotations, function (type, path) {
        plain = setDeep(plain, path, function (v) { return untransformValue(v, type, superJson); });
    });
    return plain;
}
export function applyReferentialEqualityAnnotations(plain, annotations) {
    function apply(identicalPaths, path) {
        var object = getDeep(plain, parsePath(path));
        identicalPaths.map(parsePath).forEach(function (identicalObjectPath) {
            plain = setDeep(plain, identicalObjectPath, function () { return object; });
        });
    }
    if (isArray(annotations)) {
        var _a = __read(annotations, 2), root = _a[0], other = _a[1];
        root.forEach(function (identicalPath) {
            plain = setDeep(plain, parsePath(identicalPath), function () { return plain; });
        });
        if (other) {
            forEach(other, apply);
        }
    }
    else {
        forEach(annotations, apply);
    }
    return plain;
}
var isDeep = function (object, superJson) {
    return isPlainObject(object) ||
        isArray(object) ||
        isMap(object) ||
        isSet(object) ||
        isInstanceOfRegisteredClass(object, superJson);
};
function addIdentity(object, path, identities) {
    var existingSet = identities.get(object);
    if (existingSet) {
        existingSet.push(path);
    }
    else {
        identities.set(object, [path]);
    }
}
export function generateReferentialEqualityAnnotations(identitites, dedupe) {
    var result = {};
    var rootEqualityPaths = undefined;
    identitites.forEach(function (paths) {
        if (paths.length <= 1) {
            return;
        }
        // if we're not deduping, all of these objects continue existing.
        // putting the shortest path first makes it easier to parse for humans
        // if we're deduping though, only the first entry will still exist, so we can't do this optimisation.
        if (!dedupe) {
            paths = paths
                .map(function (path) { return path.map(String); })
                .sort(function (a, b) { return a.length - b.length; });
        }
        var _a = __read(paths), representativePath = _a[0], identicalPaths = _a.slice(1);
        if (representativePath.length === 0) {
            rootEqualityPaths = identicalPaths.map(stringifyPath);
        }
        else {
            result[stringifyPath(representativePath)] = identicalPaths.map(stringifyPath);
        }
    });
    if (rootEqualityPaths) {
        if (isEmptyObject(result)) {
            return [rootEqualityPaths];
        }
        else {
            return [rootEqualityPaths, result];
        }
    }
    else {
        return isEmptyObject(result) ? undefined : result;
    }
}
export var walker = function (object, identities, superJson, dedupe, path, objectsInThisPath, seenObjects) {
    var _a;
    if (path === void 0) { path = []; }
    if (objectsInThisPath === void 0) { objectsInThisPath = []; }
    if (seenObjects === void 0) { seenObjects = new Map(); }
    var primitive = isPrimitive(object);
    if (!primitive) {
        addIdentity(object, path, identities);
        var seen = seenObjects.get(object);
        if (seen) {
            // short-circuit result if we've seen this object before
            return dedupe
                ? {
                    transformedValue: null
                }
                : seen;
        }
    }
    if (!isDeep(object, superJson)) {
        var transformed_1 = transformValue(object, superJson);
        var result_1 = transformed_1
            ? {
                transformedValue: transformed_1.value,
                annotations: [transformed_1.type]
            }
            : {
                transformedValue: object
            };
        if (!primitive) {
            seenObjects.set(object, result_1);
        }
        return result_1;
    }
    if (includes(objectsInThisPath, object)) {
        // prevent circular references
        return {
            transformedValue: null
        };
    }
    var transformationResult = transformValue(object, superJson);
    var transformed = (_a = transformationResult === null || transformationResult === void 0 ? void 0 : transformationResult.value) !== null && _a !== void 0 ? _a : object;
    var transformedValue = isArray(transformed) ? [] : {};
    var innerAnnotations = {};
    forEach(transformed, function (value, index) {
        var recursiveResult = walker(value, identities, superJson, dedupe, __spreadArray(__spreadArray([], __read(path)), [index]), __spreadArray(__spreadArray([], __read(objectsInThisPath)), [object]), seenObjects);
        transformedValue[index] = recursiveResult.transformedValue;
        if (isArray(recursiveResult.annotations)) {
            innerAnnotations[index] = recursiveResult.annotations;
        }
        else if (isPlainObject(recursiveResult.annotations)) {
            forEach(recursiveResult.annotations, function (tree, key) {
                innerAnnotations[escapeKey(index) + '.' + key] = tree;
            });
        }
    });
    var result = isEmptyObject(innerAnnotations)
        ? {
            transformedValue: transformedValue,
            annotations: !!transformationResult
                ? [transformationResult.type]
                : undefined
        }
        : {
            transformedValue: transformedValue,
            annotations: !!transformationResult
                ? [transformationResult.type, innerAnnotations]
                : innerAnnotations
        };
    if (!primitive) {
        seenObjects.set(object, result);
    }
    return result;
};
//# sourceMappingURL=plainer.js.map