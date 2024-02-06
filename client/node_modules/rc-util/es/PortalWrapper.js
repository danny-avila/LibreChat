import _classCallCheck from "@babel/runtime/helpers/esm/classCallCheck";
import _createClass from "@babel/runtime/helpers/esm/createClass";
import _assertThisInitialized from "@babel/runtime/helpers/esm/assertThisInitialized";
import _inherits from "@babel/runtime/helpers/esm/inherits";
import _createSuper from "@babel/runtime/helpers/esm/createSuper";
import _defineProperty from "@babel/runtime/helpers/esm/defineProperty";
import _typeof from "@babel/runtime/helpers/esm/typeof";
/* eslint-disable no-underscore-dangle,react/require-default-props */
import * as React from 'react';
import raf from "./raf";
import Portal from "./Portal";
import canUseDom from "./Dom/canUseDom";
import switchScrollingEffect from "./switchScrollingEffect";
import setStyle from "./setStyle";
import ScrollLocker from "./Dom/scrollLocker";
var openCount = 0;
var supportDom = canUseDom();

/** @private Test usage only */
export function getOpenCount() {
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
    if (_typeof(getContainer) === 'object' && getContainer instanceof window.HTMLElement) {
      return getContainer;
    }
  }
  return document.body;
};
var PortalWrapper = /*#__PURE__*/function (_React$Component) {
  _inherits(PortalWrapper, _React$Component);
  var _super = _createSuper(PortalWrapper);
  function PortalWrapper(props) {
    var _this;
    _classCallCheck(this, PortalWrapper);
    _this = _super.call(this, props);
    _defineProperty(_assertThisInitialized(_this), "container", void 0);
    _defineProperty(_assertThisInitialized(_this), "componentRef", /*#__PURE__*/React.createRef());
    _defineProperty(_assertThisInitialized(_this), "rafId", void 0);
    _defineProperty(_assertThisInitialized(_this), "scrollLocker", void 0);
    _defineProperty(_assertThisInitialized(_this), "renderComponent", void 0);
    _defineProperty(_assertThisInitialized(_this), "updateScrollLocker", function (prevProps) {
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
    _defineProperty(_assertThisInitialized(_this), "updateOpenCount", function (prevProps) {
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
    _defineProperty(_assertThisInitialized(_this), "attachToParent", function () {
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
    _defineProperty(_assertThisInitialized(_this), "getContainer", function () {
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
    _defineProperty(_assertThisInitialized(_this), "setWrapperClassName", function () {
      var wrapperClassName = _this.props.wrapperClassName;
      if (_this.container && wrapperClassName && wrapperClassName !== _this.container.className) {
        _this.container.className = wrapperClassName;
      }
    });
    _defineProperty(_assertThisInitialized(_this), "removeCurrentContainer", function () {
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
    _defineProperty(_assertThisInitialized(_this), "switchScrollingEffect", function () {
      if (openCount === 1 && !Object.keys(cacheOverflow).length) {
        switchScrollingEffect();
        // Must be set after switchScrollingEffect
        cacheOverflow = setStyle({
          overflow: 'hidden',
          overflowX: 'hidden',
          overflowY: 'hidden'
        });
      } else if (!openCount) {
        setStyle(cacheOverflow);
        cacheOverflow = {};
        switchScrollingEffect(true);
      }
    });
    _this.scrollLocker = new ScrollLocker({
      container: getParent(props.getContainer)
    });
    return _this;
  }
  _createClass(PortalWrapper, [{
    key: "componentDidMount",
    value: function componentDidMount() {
      var _this2 = this;
      this.updateOpenCount();
      if (!this.attachToParent()) {
        this.rafId = raf(function () {
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
      raf.cancel(this.rafId);
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
        portal = /*#__PURE__*/React.createElement(Portal, {
          getContainer: this.getContainer,
          ref: this.componentRef
        }, children(childProps));
      }
      return portal;
    }
  }]);
  return PortalWrapper;
}(React.Component);
export default PortalWrapper;