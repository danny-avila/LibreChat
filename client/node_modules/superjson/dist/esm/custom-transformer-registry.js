import { find } from './util';
var CustomTransformerRegistry = /** @class */ (function () {
    function CustomTransformerRegistry() {
        this.transfomers = {};
    }
    CustomTransformerRegistry.prototype.register = function (transformer) {
        this.transfomers[transformer.name] = transformer;
    };
    CustomTransformerRegistry.prototype.findApplicable = function (v) {
        return find(this.transfomers, function (transformer) {
            return transformer.isApplicable(v);
        });
    };
    CustomTransformerRegistry.prototype.findByName = function (name) {
        return this.transfomers[name];
    };
    return CustomTransformerRegistry;
}());
export { CustomTransformerRegistry };
//# sourceMappingURL=custom-transformer-registry.js.map