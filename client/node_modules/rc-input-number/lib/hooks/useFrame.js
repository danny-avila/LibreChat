"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _react = require("react");
var _raf = _interopRequireDefault(require("rc-util/lib/raf"));
/**
 * Always trigger latest once when call multiple time
 */
var _default = function _default() {
  var idRef = (0, _react.useRef)(0);
  var cleanUp = function cleanUp() {
    _raf.default.cancel(idRef.current);
  };
  (0, _react.useEffect)(function () {
    return cleanUp;
  }, []);
  return function (callback) {
    cleanUp();
    idRef.current = (0, _raf.default)(function () {
      callback();
    });
  };
};
exports.default = _default;