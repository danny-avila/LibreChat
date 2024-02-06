"use strict";

var _interopRequireWildcard = require("@babel/runtime/helpers/interopRequireWildcard").default;
var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
exports.getOpenCount = getOpenCount;
var _classCallCheck2 = _interopRequireDefault(require("@babel/runtime/helpers/classCallCheck"));
var _createClass2 = _interopRequireDefault(require("@babel/runtime/helpers/createClass"));
var _assertThisInitialized2 = _interopRequireDefault(require("@babel/runtime/helpers/assertThisInitialized"));
var _inherits2 = _interopRequireDefault(require("@babel/runtime/helpers/inherits"));
var _createSuper2 = _interopRequireDefault(require("@babel/runtime/helpers/createSuper"));
var _defineProperty2 = _interopRequireDefault(require("@babel/runtime/helpers/defineProperty"));
var _typeof2 = _interopRequireDefault(require("@babel/runtime/helpers/typeof"));
var React = _interopRequireWildcard(require("react"));
var _raf = _interopRequireDefault(require("./raf"));
var _Portal = _interopRequireDefault(require("./Portal"));
var _canUseDom = _interopRequireDefault(require("./Dom/canUseDom"));
var _switchScrollingEffect = _interopRequireDefault(require("./switchScrollingEffect"));
var _setStyle = _interopRequireDefault(require("./setStyle"));
var _scrollLocker = _interopRequireDefault(require("./Dom/scrollLocker"));
/* eslint-disable no-underscore-dangle,react/require-default-props */

var openCount = 0;
var supportDom = (0, _canUseDom.default)();

/** @private Test usage only */
function getOpenCount() {
  return process.env.NODE_ENV === 'test' ? openCount : 0;
}

// https://github.com/ant-design/ant-design/issues/19340
// https://github.com/ant-design/ant-design/issues/19332
var cacheOverflow = {};
var getParent = function getParent(getContainer) {
  if (!supportDom) {
    return null;
  }
  if (getContainer) {
    if (typeof getContainer === 'string') {
      return document.querySelectorAll(getContainer)[0];
    }
    if (typeof getContainer === 'function') {
      return getContainer();
    }
    if ((0, _typeof2.default)(getContainer) === 'object' && getContainer instanceof window.HTMLElement) {
      return getContainer;
    }
  }
  return document.body;
};
var PortalWrapper = /*#__PURE__*/function (_React$Component) {
  (0, _inherits2.default)(PortalWrapper, _React$Component);
  var _super = (0, _createSuper2.default)(PortalWrapper);
  function PortalWrapper(props) {
    var _this;
    (0, _classCallCheck2.default)(this, PortalWrapper);
    _this = _super.call(this, props);
    (0, _defineProperty2.default)((0, _assertThisInitialized2.default)(_this), "container", void 0);
    (0, _defineProperty2.default)((0, _assertThisInitialized2.default)(_this), "componentRef", /*#__PURE__*/React.createRef());
    (0, _defineProperty2.default)((0, _assertThisInitialized2.default)(_this), "rafId", void 0);
    (0, _defineProperty2.default)((0, _assertThisInitialized2.default)(_this), "scrollLocker", void 0);
    (0, _defineProperty2.default)((0, _assertThisInitialized2.default)(_this), "renderComponent", void 0);
    (0, _defineProperty2.default)((0, _assertThisInitialized2.default)(_this), "updateScrollLocker", function (prevProps) {
      var _ref = prevProps || {},
        prevVisible = _ref.visible;
      var _this$props = _this.props,
        getContainer = _this$props.getContainer,
        visible = _this$props.visible;
      if (visible && visible !== prevVisible && supportDom && getParent(getContainer) !== _this.scrollLocker.getContainer()) {
        _this.scrollLocker.reLock({
          container: getParent(getContainer)
        });
      }
    });
    (0, _defineProperty2.default)((0, _assertThisInitialized2.default)(_this), "updateOpenCount", function (prevProps) {
      var _ref2 = prevProps || {},
        prevVisible = _ref2.visible,
        prevGetContainer = _ref2.getContainer;
      var _this$props2 = _this.props,
        visible = _this$props2.visible,
        getContainer = _this$props2.getContainer;

      // Update count
      if (visible !== prevVisible && supportDom && getParent(getContainer) === document.body) {
        if (visible && !prevVisible) {
          openCount += 1;
        } else if (prevProps) {
          openCount -= 1;
        }
      }

      // Clean up container if needed
      var getContainerIsFunc = typeof getContainer === 'function' && typeof prevGetContainer === 'function';
      if (getContainerIsFunc ? getContainer.toString() !== prevGetContainer.toString() : getContainer !== prevGetContainer) {
        _this.removeCurrentContainer();
      }
    });
    (0, _defineProperty2.default)((0, _assertThisInitialized2.default)(_this), "attachToParent", function () {
      var force = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;
      if (force || _this.container && !_this.container.parentNode) {
        var parent = getParent(_this.props.getContainer);
        if (parent) {
          parent.appendChild(_this.container);
          return true;
        }
        return false;
      }
      return true;
    });
    (0, _defineProperty2.default)((0, _assertThisInitialized2.default)(_this), "getContainer", function () {
      if (!supportDom) {
        return null;
      }
      if (!_this.container) {
        _this.container = document.createElement('div');
        _this.attachToParent(true);
      }
      _this.setWrapperClassName();
      return _this.container;
    });
    (0, _defineProperty2.default)((0, _assertThisInitialized2.default)(_this), "setWrapperClassName", function () {
      var wrapperClassName = _this.props.wrapperClassName;
      if (_this.container && wrapperClassName && wrapperClassName !== _this.container.className) {
        _this.container.className = wrapperClassName;
      }
    });
    (0, _defineProperty2.default)((0, _assertThisInitialized2.default)(_this), "removeCurrentContainer", function () {
      var _this$container;
      // Portal will remove from `parentNode`.
      // Let's handle this again to avoid refactor issue.
      (_this$container = _this.container) === null || _this$container === void 0 || (_this$container = _this$container.parentNode) === null || _this$container === void 0 || _this$container.removeChild(_this.container);
    });
    /**
     * Enhance ./switchScrollingEffect
     * 1. Simulate document body scroll bar with
     * 2. Record body has overflow style and recover when all of PortalWrapper invisible
     * 3. Disable body scroll when PortalWrapper has open
     *
     * @memberof PortalWrapper
     */
    (0, _defineProperty2.default)((0, _assertThisInitialized2.default)(_this), "switchScrollingEffect", function () {
      if (openCount === 1 && !Object.keys(cacheOverflow).length) {
        (0, _switchScrollingEffect.default)();
        // Must be set after switchScrollingEffect
        cacheOverflow = (0, _setStyle.default)({
          overflow: 'hidden',
          overflowX: 'hidden',
          overflowY: 'hidden'
        });
      } else if (!openCount) {
        (0, _setStyle.default)(cacheOverflow);
        cacheOverflow = {};
        (0, _switchScrollingEffect.default)(true);
      }
    });
    _this.scrollLocker = new _scrollLocker.default({
      container: getParent(props.getContainer)
    });
    return _this;
  }
  (0, _createClass2.default)(PortalWrapper, [{
    key: "componentDidMount",
    value: function componentDidMount() {
      var _this2 = this;
      this.updateOpenCount();
      if (!this.attachToParent()) {
        this.rafId = (0, _raf.default)(function () {
          _this2.forceUpdate();
        });
      }
    }
  }, {
    key: "componentDidUpdate",
    value: function componentDidUpdate(prevProps) {
      this.updateOpenCount(prevProps);
      this.updateScrollLocker(prevProps);
      this.setWrapperClassName();
      this.attachToParent();
    }
  }, {
    key: "componentWillUnmount",
    value: function componentWillUnmount() {
      var _this$props3 = this.props,
        visible = _this$props3.visible,
        getContainer = _this$props3.getContainer;
      if (supportDom && getParent(getContainer) === document.body) {
        // 离开时不会 render， 导到离开时数值不变，改用 func 。。
        openCount = visible && openCount ? openCount - 1 : openCount;
      }
      this.removeCurrentContainer();
      _raf.default.cancel(this.rafId);
    }
  }, {
    key: "render",
    value: function render() {
      var _this$props4 = this.props,
        children = _this$props4.children,
        forceRender = _this$props4.forceRender,
        visible = _this$props4.visible;
      var portal = null;
      var childProps = {
        getOpenCount: function getOpenCount() {
          return openCount;
        },
        getContainer: this.getContainer,
        switchScrollingEffect: this.switchScrollingEffect,
        scrollLocker: this.scrollLocker
      };
      if (forceRender || visible || this.componentRef.current) {
        portal = /*#__PURE__*/React.createElement(_Portal.default, {
          getContainer: this.getContainer,
          ref: this.componentRef
        }, children(childProps));
      }
      return portal;
    }
  }]);
  return PortalWrapper;
}(React.Component);
var _default = exports.default = PortalWrapper;