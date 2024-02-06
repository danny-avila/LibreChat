"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _objectSpread2 = _interopRequireDefault(require("@babel/runtime/helpers/objectSpread2"));
function composeProps(originProps, patchProps, isAll) {
  var composedProps = (0, _objectSpread2.default)((0, _objectSpread2.default)({}, originProps), isAll ? patchProps : {});
  Object.keys(patchProps).forEach(function (key) {
    var func = patchProps[key];
    if (typeof func === 'function') {
      composedProps[key] = function () {
        var _originProps$key;
        for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
          args[_key] = arguments[_key];
        }
        func.apply(void 0, args);
        return (_originProps$key = originProps[key]) === null || _originProps$key === void 0 ? void 0 : _originProps$key.call.apply(_originProps$key, [originProps].concat(args));
      };
    }
  });
  return composedProps;
}
var _default = exports.default = composeProps;