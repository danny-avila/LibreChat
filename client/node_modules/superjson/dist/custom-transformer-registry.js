"use strict";
exports.__esModule = true;
exports.CustomTransformerRegistry = void 0;
var util_1 = require("./util");
var CustomTransformerRegistry = /** @class */ (function () {
    function CustomTransformerRegistry() {
        this.transfomers = {};
    }
    CustomTransformerRegistry.prototype.register = function (transformer) {
        this.transfomers[transformer.name] = transformer;
    };
    CustomTransformerRegistry.prototype.findApplicable = function (v) {
        return util_1.find(this.transfomers, function (transformer) {
            return transformer.isApplicable(v);
        });
    };
    CustomTransformerRegistry.prototype.findByName = function (name) {
        return this.transfomers[name];
    };
    return CustomTransformerRegistry;
}());
exports.CustomTransformerRegistry = CustomTransformerRegistry;
//# sourceMappingURL=custom-transformer-registry.js.map