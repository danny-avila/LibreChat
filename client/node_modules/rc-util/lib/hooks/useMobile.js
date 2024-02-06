"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _slicedToArray2 = _interopRequireDefault(require("@babel/runtime/helpers/slicedToArray"));
var _react = require("react");
var _isMobile = _interopRequireDefault(require("../isMobile"));
var _useLayoutEffect = _interopRequireDefault(require("./useLayoutEffect"));
/**
 * Hook to detect if the user is on a mobile device
 * Notice that this hook will only detect the device type in effect, so it will always be false in server side
 */
var useMobile = function useMobile() {
  var _useState = (0, _react.useState)(false),
    _useState2 = (0, _slicedToArray2.default)(_useState, 2),
    mobile = _useState2[0],
    setMobile = _useState2[1];
  (0, _useLayoutEffect.default)(function () {
    setMobile((0, _isMobile.default)());
  }, []);
  return mobile;
};
var _default = exports.default = useMobile;