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
import { ClassRegistry } from './class-registry';
import { Registry } from './registry';
import { CustomTransformerRegistry, } from './custom-transformer-registry';
import { applyReferentialEqualityAnnotations, applyValueAnnotations, generateReferentialEqualityAnnotations, walker, } from './plainer';
import { copy } from 'copy-anything';
var SuperJSON = /** @class */ (function () {
    /**
     * @param dedupeReferentialEqualities  If true, SuperJSON will make sure only one instance of referentially equal objects are serialized and the rest are replaced with `null`.
     */
    function SuperJSON(_a) {
        var _b = _a === void 0 ? {} : _a, _c = _b.dedupe, dedupe = _c === void 0 ? false : _c;
        this.classRegistry = new ClassRegistry();
        this.symbolRegistry = new Registry(function (s) { var _a; return (_a = s.description) !== null && _a !== void 0 ? _a : ''; });
        this.customTransformerRegistry = new CustomTransformerRegistry();
        this.allowedErrorProps = [];
        this.dedupe = dedupe;
    }
    SuperJSON.prototype.serialize = function (object) {
        var identities = new Map();
        var output = walker(object, identities, this, this.dedupe);
        var res = {
            json: output.transformedValue
        };
        if (output.annotations) {
            res.meta = __assign(__assign({}, res.meta), { values: output.annotations });
        }
        var equalityAnnotations = generateReferentialEqualityAnnotations(identities, this.dedupe);
        if (equalityAnnotations) {
            res.meta = __assign(__assign({}, res.meta), { referentialEqualities: equalityAnnotations });
        }
        return res;
    };
    SuperJSON.prototype.deserialize = function (payload) {
        var json = payload.json, meta = payload.meta;
        var result = copy(json);
        if (meta === null || meta === void 0 ? void 0 : meta.values) {
            result = applyValueAnnotations(result, meta.values, this);
        }
        if (meta === null || meta === void 0 ? void 0 : meta.referentialEqualities) {
            result = applyReferentialEqualityAnnotations(result, meta.referentialEqualities);
        }
        return result;
    };
    SuperJSON.prototype.stringify = function (object) {
        return JSON.stringify(this.serialize(object));
    };
    SuperJSON.prototype.parse = function (string) {
        return this.deserialize(JSON.parse(string));
    };
    SuperJSON.prototype.registerClass = function (v, options) {
        this.classRegistry.register(v, options);
    };
    SuperJSON.prototype.registerSymbol = function (v, identifier) {
        this.symbolRegistry.register(v, identifier);
    };
    SuperJSON.prototype.registerCustom = function (transformer, name) {
        this.customTransformerRegistry.register(__assign({ name: name }, transformer));
    };
    SuperJSON.prototype.allowErrorProps = function () {
        var _a;
        var props = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            props[_i] = arguments[_i];
        }
        (_a = this.allowedErrorProps).push.apply(_a, __spreadArray([], __read(props)));
    };
    SuperJSON.defaultInstance = new SuperJSON();
    SuperJSON.serialize = SuperJSON.defaultInstance.serialize.bind(SuperJSON.defaultInstance);
    SuperJSON.deserialize = SuperJSON.defaultInstance.deserialize.bind(SuperJSON.defaultInstance);
    SuperJSON.stringify = SuperJSON.defaultInstance.stringify.bind(SuperJSON.defaultInstance);
    SuperJSON.parse = SuperJSON.defaultInstance.parse.bind(SuperJSON.defaultInstance);
    SuperJSON.registerClass = SuperJSON.defaultInstance.registerClass.bind(SuperJSON.defaultInstance);
    SuperJSON.registerSymbol = SuperJSON.defaultInstance.registerSymbol.bind(SuperJSON.defaultInstance);
    SuperJSON.registerCustom = SuperJSON.defaultInstance.registerCustom.bind(SuperJSON.defaultInstance);
    SuperJSON.allowErrorProps = SuperJSON.defaultInstance.allowErrorProps.bind(SuperJSON.defaultInstance);
    return SuperJSON;
}());
export default SuperJSON;
export { SuperJSON };
export var serialize = SuperJSON.serialize;
export var deserialize = SuperJSON.deserialize;
export var stringify = SuperJSON.stringify;
export var parse = SuperJSON.parse;
export var registerClass = SuperJSON.registerClass;
export var registerCustom = SuperJSON.registerCustom;
export var registerSymbol = SuperJSON.registerSymbol;
export var allowErrorProps = SuperJSON.allowErrorProps;
//# sourceMappingURL=index.js.map