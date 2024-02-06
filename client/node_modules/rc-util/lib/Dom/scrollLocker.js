"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _toConsumableArray2 = _interopRequireDefault(require("@babel/runtime/helpers/toConsumableArray"));
var _createClass2 = _interopRequireDefault(require("@babel/runtime/helpers/createClass"));
var _classCallCheck2 = _interopRequireDefault(require("@babel/runtime/helpers/classCallCheck"));
var _defineProperty2 = _interopRequireDefault(require("@babel/runtime/helpers/defineProperty"));
var _getScrollBarSize = _interopRequireDefault(require("../getScrollBarSize"));
var _setStyle = _interopRequireDefault(require("../setStyle"));
var uuid = 0;
var locks = [];
var scrollingEffectClassName = 'ant-scrolling-effect';
var scrollingEffectClassNameReg = new RegExp("".concat(scrollingEffectClassName), 'g');

// https://github.com/ant-design/ant-design/issues/19340
// https://github.com/ant-design/ant-design/issues/19332
var cacheStyle = new Map();
var ScrollLocker = exports.default = /*#__PURE__*/(0, _createClass2.default)(function ScrollLocker(_options) {
  var _this = this;
  (0, _classCallCheck2.default)(this, ScrollLocker);
  (0, _defineProperty2.default)(this, "lockTarget", void 0);
  (0, _defineProperty2.default)(this, "options", void 0);
  (0, _defineProperty2.default)(this, "getContainer", function () {
    var _this$options;
    return (_this$options = _this.options) === null || _this$options === void 0 ? void 0 : _this$options.container;
  });
  // if options change...
  (0, _defineProperty2.default)(this, "reLock", function (options) {
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
  (0, _defineProperty2.default)(this, "lock", function () {
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
      locks = [].concat((0, _toConsumableArray2.default)(locks), [{
        target: _this.lockTarget,
        options: _this.options
      }]);
      return;
    }
    var scrollBarSize = 0;
    var container = ((_this$options3 = _this.options) === null || _this$options3 === void 0 ? void 0 : _this$options3.container) || document.body;
    if (container === document.body && window.innerWidth - document.documentElement.clientWidth > 0 || container.scrollHeight > container.clientHeight) {
      if (getComputedStyle(container).overflow !== 'hidden') {
        scrollBarSize = (0, _getScrollBarSize.default)();
      }
    }
    var containerClassName = container.className;
    if (locks.filter(function (_ref4) {
      var _this$options4;
      var options = _ref4.options;
      return (options === null || options === void 0 ? void 0 : options.container) === ((_this$options4 = _this.options) === null || _this$options4 === void 0 ? void 0 : _this$options4.container);
    }).length === 0) {
      cacheStyle.set(container, (0, _setStyle.default)({
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
    locks = [].concat((0, _toConsumableArray2.default)(locks), [{
      target: _this.lockTarget,
      options: _this.options
    }]);
  });
  (0, _defineProperty2.default)(this, "unLock", function () {
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
    (0, _setStyle.default)(cacheStyle.get(container), {
      element: container
    });
    cacheStyle.delete(container);
    container.className = container.className.replace(scrollingEffectClassNameReg, '').trim();
  });
  // eslint-disable-next-line no-plusplus
  this.lockTarget = uuid++;
  this.options = _options;
});