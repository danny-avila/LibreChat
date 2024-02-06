"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _getScrollBarSize = _interopRequireDefault(require("./getScrollBarSize"));
var _setStyle = _interopRequireDefault(require("./setStyle"));
function isBodyOverflowing() {
  return document.body.scrollHeight > (window.innerHeight || document.documentElement.clientHeight) && window.innerWidth > document.body.offsetWidth;
}
var cacheStyle = {};
var _default = exports.default = function _default(close) {
  if (!isBodyOverflowing() && !close) {
    return;
  }

  // https://github.com/ant-design/ant-design/issues/19729
  var scrollingEffectClassName = 'ant-scrolling-effect';
  var scrollingEffectClassNameReg = new RegExp("".concat(scrollingEffectClassName), 'g');
  var bodyClassName = document.body.className;
  if (close) {
    if (!scrollingEffectClassNameReg.test(bodyClassName)) return;
    (0, _setStyle.default)(cacheStyle);
    cacheStyle = {};
    document.body.className = bodyClassName.replace(scrollingEffectClassNameReg, '').trim();
    return;
  }
  var scrollBarSize = (0, _getScrollBarSize.default)();
  if (scrollBarSize) {
    cacheStyle = (0, _setStyle.default)({
      position: 'relative',
      width: "calc(100% - ".concat(scrollBarSize, "px)")
    });
    if (!scrollingEffectClassNameReg.test(bodyClassName)) {
      var addClassName = "".concat(bodyClassName, " ").concat(scrollingEffectClassName);
      document.body.className = addClassName.trim();
    }
  }
};