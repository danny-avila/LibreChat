import _toConsumableArray from "@babel/runtime/helpers/esm/toConsumableArray";
import _createClass from "@babel/runtime/helpers/esm/createClass";
import _classCallCheck from "@babel/runtime/helpers/esm/classCallCheck";
import _defineProperty from "@babel/runtime/helpers/esm/defineProperty";
import getScrollBarSize from "../getScrollBarSize";
import setStyle from "../setStyle";
var uuid = 0;
var locks = [];
var scrollingEffectClassName = 'ant-scrolling-effect';
var scrollingEffectClassNameReg = new RegExp("".concat(scrollingEffectClassName), 'g');

// https://github.com/ant-design/ant-design/issues/19340
// https://github.com/ant-design/ant-design/issues/19332
var cacheStyle = new Map();
var ScrollLocker = /*#__PURE__*/_createClass(function ScrollLocker(_options) {
  var _this = this;
  _classCallCheck(this, ScrollLocker);
  _defineProperty(this, "lockTarget", void 0);
  _defineProperty(this, "options", void 0);
  _defineProperty(this, "getContainer", function () {
    var _this$options;
    return (_this$options = _this.options) === null || _this$options === void 0 ? void 0 : _this$options.container;
  });
  // if options change...
  _defineProperty(this, "reLock", function (options) {
    var findLock = locks.find(function (_ref) {
      var target = _ref.target;
      return target === _this.lockTarget;
    });
    if (findLock) {
      _this.unLock();
    }
    _this.options = options;
    if (findLock) {
      findLock.options = options;
      _this.lock();
    }
  });
  _defineProperty(this, "lock", function () {
    var _this$options3;
    // If lockTarget exist return
    if (locks.some(function (_ref2) {
      var target = _ref2.target;
      return target === _this.lockTarget;
    })) {
      return;
    }

    // If same container effect, return
    if (locks.some(function (_ref3) {
      var _this$options2;
      var options = _ref3.options;
      return (options === null || options === void 0 ? void 0 : options.container) === ((_this$options2 = _this.options) === null || _this$options2 === void 0 ? void 0 : _this$options2.container);
    })) {
      locks = [].concat(_toConsumableArray(locks), [{
        target: _this.lockTarget,
        options: _this.options
      }]);
      return;
    }
    var scrollBarSize = 0;
    var container = ((_this$options3 = _this.options) === null || _this$options3 === void 0 ? void 0 : _this$options3.container) || document.body;
    if (container === document.body && window.innerWidth - document.documentElement.clientWidth > 0 || container.scrollHeight > container.clientHeight) {
      if (getComputedStyle(container).overflow !== 'hidden') {
        scrollBarSize = getScrollBarSize();
      }
    }
    var containerClassName = container.className;
    if (locks.filter(function (_ref4) {
      var _this$options4;
      var options = _ref4.options;
      return (options === null || options === void 0 ? void 0 : options.container) === ((_this$options4 = _this.options) === null || _this$options4 === void 0 ? void 0 : _this$options4.container);
    }).length === 0) {
      cacheStyle.set(container, setStyle({
        width: scrollBarSize !== 0 ? "calc(100% - ".concat(scrollBarSize, "px)") : undefined,
        overflow: 'hidden',
        overflowX: 'hidden',
        overflowY: 'hidden'
      }, {
        element: container
      }));
    }

    // https://github.com/ant-design/ant-design/issues/19729
    if (!scrollingEffectClassNameReg.test(containerClassName)) {
      var addClassName = "".concat(containerClassName, " ").concat(scrollingEffectClassName);
      container.className = addClassName.trim();
    }
    locks = [].concat(_toConsumableArray(locks), [{
      target: _this.lockTarget,
      options: _this.options
    }]);
  });
  _defineProperty(this, "unLock", function () {
    var _this$options5;
    var findLock = locks.find(function (_ref5) {
      var target = _ref5.target;
      return target === _this.lockTarget;
    });
    locks = locks.filter(function (_ref6) {
      var target = _ref6.target;
      return target !== _this.lockTarget;
    });
    if (!findLock || locks.some(function (_ref7) {
      var _findLock$options;
      var options = _ref7.options;
      return (options === null || options === void 0 ? void 0 : options.container) === ((_findLock$options = findLock.options) === null || _findLock$options === void 0 ? void 0 : _findLock$options.container);
    })) {
      return;
    }

    // Remove Effect
    var container = ((_this$options5 = _this.options) === null || _this$options5 === void 0 ? void 0 : _this$options5.container) || document.body;
    var containerClassName = container.className;
    if (!scrollingEffectClassNameReg.test(containerClassName)) return;
    setStyle(cacheStyle.get(container), {
      element: container
    });
    cacheStyle.delete(container);
    container.className = container.className.replace(scrollingEffectClassNameReg, '').trim();
  });
  // eslint-disable-next-line no-plusplus
  this.lockTarget = uuid++;
  this.options = _options;
});
export { ScrollLocker as default };