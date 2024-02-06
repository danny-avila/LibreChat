"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
exports.__esModule = true;
exports.ClassRegistry = void 0;
var registry_1 = require("./registry");
var ClassRegistry = /** @class */ (function (_super) {
    __extends(ClassRegistry, _super);
    function ClassRegistry() {
        var _this = _super.call(this, function (c) { return c.name; }) || this;
        _this.classToAllowedProps = new Map();
        return _this;
    }
    ClassRegistry.prototype.register = function (value, options) {
        if (typeof options === 'object') {
            if (options.allowProps) {
                this.classToAllowedProps.set(value, options.allowProps);
            }
            _super.prototype.register.call(this, value, options.identifier);
        }
        else {
            _super.prototype.register.call(this, value, options);
        }
    };
    ClassRegistry.prototype.getAllowedProps = function (value) {
        return this.classToAllowedProps.get(value);
    };
    return ClassRegistry;
}(registry_1.Registry));
exports.ClassRegistry = ClassRegistry;
//# sourceMappingURL=class-registry.js.map