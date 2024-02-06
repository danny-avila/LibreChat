"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.__esModule = true;
exports.untransformValue = exports.transformValue = exports.isInstanceOfRegisteredClass = void 0;
var is_1 = require("./is");
var util_1 = require("./util");
function simpleTransformation(isApplicable, annotation, transform, untransform) {
    return {
        isApplicable: isApplicable,
        annotation: annotation,
        transform: transform,
        untransform: untransform
    };
}
var simpleRules = [
    simpleTransformation(is_1.isUndefined, 'undefined', function () { return null; }, function () { return undefined; }),
    simpleTransformation(is_1.isBigint, 'bigint', function (v) { return v.toString(); }, function (v) {
        if (typeof BigInt !== 'undefined') {
            return BigInt(v);
        }
        console.error('Please add a BigInt polyfill.');
        return v;
    }),
    simpleTransformation(is_1.isDate, 'Date', function (v) { return v.toISOString(); }, function (v) { return new Date(v); }),
    simpleTransformation(is_1.isError, 'Error', function (v, superJson) {
        var baseError = {
            name: v.name,
            message: v.message
        };
        superJson.allowedErrorProps.forEach(function (prop) {
            baseError[prop] = v[prop];
        });
        return baseError;
    }, function (v, superJson) {
        var e = new Error(v.message);
        e.name = v.name;
        e.stack = v.stack;
        superJson.allowedErrorProps.forEach(function (prop) {
            e[prop] = v[prop];
        });
        return e;
    }),
    simpleTransformation(is_1.isRegExp, 'regexp', function (v) { return '' + v; }, function (regex) {
        var body = regex.slice(1, regex.lastIndexOf('/'));
        var flags = regex.slice(regex.lastIndexOf('/') + 1);
        return new RegExp(body, flags);
    }),
    simpleTransformation(is_1.isSet, 'set', 
    // (sets only exist in es6+)
    // eslint-disable-next-line es5/no-es6-methods
    function (v) { return __spreadArray([], __read(v.values())); }, function (v) { return new Set(v); }),
    simpleTransformation(is_1.isMap, 'map', function (v) { return __spreadArray([], __read(v.entries())); }, function (v) { return new Map(v); }),
    simpleTransformation(function (v) { return is_1.isNaNValue(v) || is_1.isInfinite(v); }, 'number', function (v) {
        if (is_1.isNaNValue(v)) {
            return 'NaN';
        }
        if (v > 0) {
            return 'Infinity';
        }
        else {
            return '-Infinity';
        }
    }, Number),
    simpleTransformation(function (v) { return v === 0 && 1 / v === -Infinity; }, 'number', function () {
        return '-0';
    }, Number),
    simpleTransformation(is_1.isURL, 'URL', function (v) { return v.toString(); }, function (v) { return new URL(v); }),
];
function compositeTransformation(isApplicable, annotation, transform, untransform) {
    return {
        isApplicable: isApplicable,
        annotation: annotation,
        transform: transform,
        untransform: untransform
    };
}
var symbolRule = compositeTransformation(function (s, superJson) {
    if (is_1.isSymbol(s)) {
        var isRegistered = !!superJson.symbolRegistry.getIdentifier(s);
        return isRegistered;
    }
    return false;
}, function (s, superJson) {
    var identifier = superJson.symbolRegistry.getIdentifier(s);
    return ['symbol', identifier];
}, function (v) { return v.description; }, function (_, a, superJson) {
    var value = superJson.symbolRegistry.getValue(a[1]);
    if (!value) {
        throw new Error('Trying to deserialize unknown symbol');
    }
    return value;
});
var constructorToName = [
    Int8Array,
    Uint8Array,
    Int16Array,
    Uint16Array,
    Int32Array,
    Uint32Array,
    Float32Array,
    Float64Array,
    Uint8ClampedArray,
].reduce(function (obj, ctor) {
    obj[ctor.name] = ctor;
    return obj;
}, {});
var typedArrayRule = compositeTransformation(is_1.isTypedArray, function (v) { return ['typed-array', v.constructor.name]; }, function (v) { return __spreadArray([], __read(v)); }, function (v, a) {
    var ctor = constructorToName[a[1]];
    if (!ctor) {
        throw new Error('Trying to deserialize unknown typed array');
    }
    return new ctor(v);
});
function isInstanceOfRegisteredClass(potentialClass, superJson) {
    if (potentialClass === null || potentialClass === void 0 ? void 0 : potentialClass.constructor) {
        var isRegistered = !!superJson.classRegistry.getIdentifier(potentialClass.constructor);
        return isRegistered;
    }
    return false;
}
exports.isInstanceOfRegisteredClass = isInstanceOfRegisteredClass;
var classRule = compositeTransformation(isInstanceOfRegisteredClass, function (clazz, superJson) {
    var identifier = superJson.classRegistry.getIdentifier(clazz.constructor);
    return ['class', identifier];
}, function (clazz, superJson) {
    var allowedProps = superJson.classRegistry.getAllowedProps(clazz.constructor);
    if (!allowedProps) {
        return __assign({}, clazz);
    }
    var result = {};
    allowedProps.forEach(function (prop) {
        result[prop] = clazz[prop];
    });
    return result;
}, function (v, a, superJson) {
    var clazz = superJson.classRegistry.getValue(a[1]);
    if (!clazz) {
        throw new Error('Trying to deserialize unknown class - check https://github.com/blitz-js/superjson/issues/116#issuecomment-773996564');
    }
    return Object.assign(Object.create(clazz.prototype), v);
});
var customRule = compositeTransformation(function (value, superJson) {
    return !!superJson.customTransformerRegistry.findApplicable(value);
}, function (value, superJson) {
    var transformer = superJson.customTransformerRegistry.findApplicable(value);
    return ['custom', transformer.name];
}, function (value, superJson) {
    var transformer = superJson.customTransformerRegistry.findApplicable(value);
    return transformer.serialize(value);
}, function (v, a, superJson) {
    var transformer = superJson.customTransformerRegistry.findByName(a[1]);
    if (!transformer) {
        throw new Error('Trying to deserialize unknown custom value');
    }
    return transformer.deserialize(v);
});
var compositeRules = [classRule, symbolRule, customRule, typedArrayRule];
var transformValue = function (value, superJson) {
    var applicableCompositeRule = util_1.findArr(compositeRules, function (rule) {
        return rule.isApplicable(value, superJson);
    });
    if (applicableCompositeRule) {
        return {
            value: applicableCompositeRule.transform(value, superJson),
            type: applicableCompositeRule.annotation(value, superJson)
        };
    }
    var applicableSimpleRule = util_1.findArr(simpleRules, function (rule) {
        return rule.isApplicable(value, superJson);
    });
    if (applicableSimpleRule) {
        return {
            value: applicableSimpleRule.transform(value, superJson),
            type: applicableSimpleRule.annotation
        };
    }
    return undefined;
};
exports.transformValue = transformValue;
var simpleRulesByAnnotation = {};
simpleRules.forEach(function (rule) {
    simpleRulesByAnnotation[rule.annotation] = rule;
});
var untransformValue = function (json, type, superJson) {
    if (is_1.isArray(type)) {
        switch (type[0]) {
            case 'symbol':
                return symbolRule.untransform(json, type, superJson);
            case 'class':
                return classRule.untransform(json, type, superJson);
            case 'custom':
                return customRule.untransform(json, type, superJson);
            case 'typed-array':
                return typedArrayRule.untransform(json, type, superJson);
            default:
                throw new Error('Unknown transformation: ' + type);
        }
    }
    else {
        var transformation = simpleRulesByAnnotation[type];
        if (!transformation) {
            throw new Error('Unknown transformation: ' + type);
        }
        return transformation.untransform(json, superJson);
    }
};
exports.untransformValue = untransformValue;
//# sourceMappingURL=transformer.js.map