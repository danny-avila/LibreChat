"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = mapSelf;
var _react = _interopRequireDefault(require("react"));
function mirror(o) {
  return o;
}
function mapSelf(children) {
  // return ReactFragment
  return _react.default.Children.map(children, mirror);
}