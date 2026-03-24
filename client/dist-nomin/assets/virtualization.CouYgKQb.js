import { r as reactExports, a as reactDomExports, aJ as _defineProperty, aK as polyfill, aL as _inherits, aM as _createClass, aN as _classCallCheck, aO as _possibleConstructorReturn, aP as _getPrototypeOf, N as global, aQ as scrollbarSize, A as _extends, aR as _objectDestructuringEmpty, aS as _objectWithoutProperties, R as React, aT as _typeof, aU as _toConsumableArray, aV as _slicedToArray } from "./vendor.BvsoAGbO.js";
import { V as Virtualizer, e as elementScroll, o as observeElementOffset, a as observeElementRect } from "./tanstack-vendor.DkEt8I7O.js";
const useIsomorphicLayoutEffect = typeof document !== "undefined" ? reactExports.useLayoutEffect : reactExports.useEffect;
function useVirtualizerBase(options) {
  const rerender = reactExports.useReducer(() => ({}), {})[1];
  const resolvedOptions = {
    ...options,
    onChange: (instance2, sync) => {
      var _a;
      if (sync) {
        reactDomExports.flushSync(rerender);
      } else {
        rerender();
      }
      (_a = options.onChange) == null ? void 0 : _a.call(options, instance2, sync);
    }
  };
  const [instance] = reactExports.useState(
    () => new Virtualizer(resolvedOptions)
  );
  instance.setOptions(resolvedOptions);
  useIsomorphicLayoutEffect(() => {
    return instance._didMount();
  }, []);
  useIsomorphicLayoutEffect(() => {
    return instance._willUpdate();
  });
  return instance;
}
function useVirtualizer(options) {
  return useVirtualizerBase({
    observeElementRect,
    observeElementOffset,
    scrollToFn: elementScroll,
    ...options
  });
}
function ownKeys$7(e, r2) {
  var t = Object.keys(e);
  if (Object.getOwnPropertySymbols) {
    var o = Object.getOwnPropertySymbols(e);
    r2 && (o = o.filter(function(r3) {
      return Object.getOwnPropertyDescriptor(e, r3).enumerable;
    })), t.push.apply(t, o);
  }
  return t;
}
function _objectSpread$7(e) {
  for (var r2 = 1; r2 < arguments.length; r2++) {
    var t = null != arguments[r2] ? arguments[r2] : {};
    r2 % 2 ? ownKeys$7(Object(t), true).forEach(function(r3) {
      _defineProperty(e, r3, t[r3]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys$7(Object(t)).forEach(function(r3) {
      Object.defineProperty(e, r3, Object.getOwnPropertyDescriptor(t, r3));
    });
  }
  return e;
}
function _callSuper$e(t, o, e) {
  return o = _getPrototypeOf(o), _possibleConstructorReturn(t, _isNativeReflectConstruct$e() ? Reflect.construct(o, e || [], _getPrototypeOf(t).constructor) : o.apply(t, e));
}
function _isNativeReflectConstruct$e() {
  try {
    var t = !Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {
    }));
  } catch (t2) {
  }
  return (_isNativeReflectConstruct$e = function _isNativeReflectConstruct2() {
    return !!t;
  })();
}
var ArrowKeyStepper = /* @__PURE__ */ function(_React$PureComponent) {
  function ArrowKeyStepper2() {
    var _this;
    _classCallCheck(this, ArrowKeyStepper2);
    for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }
    _this = _callSuper$e(this, ArrowKeyStepper2, [].concat(args));
    _defineProperty(_this, "state", {
      scrollToColumn: 0,
      scrollToRow: 0,
      instanceProps: {
        prevScrollToColumn: 0,
        prevScrollToRow: 0
      }
    });
    _defineProperty(_this, "_columnStartIndex", 0);
    _defineProperty(_this, "_columnStopIndex", 0);
    _defineProperty(_this, "_rowStartIndex", 0);
    _defineProperty(_this, "_rowStopIndex", 0);
    _defineProperty(_this, "_onKeyDown", function(event) {
      var _this$props = _this.props, columnCount = _this$props.columnCount, disabled = _this$props.disabled, mode = _this$props.mode, rowCount = _this$props.rowCount;
      if (disabled) {
        return;
      }
      var _this$_getScrollState = _this._getScrollState(), scrollToColumnPrevious = _this$_getScrollState.scrollToColumn, scrollToRowPrevious = _this$_getScrollState.scrollToRow;
      var _this$_getScrollState2 = _this._getScrollState(), scrollToColumn = _this$_getScrollState2.scrollToColumn, scrollToRow = _this$_getScrollState2.scrollToRow;
      switch (event.key) {
        case "ArrowDown":
          scrollToRow = mode === "cells" ? Math.min(scrollToRow + 1, rowCount - 1) : Math.min(_this._rowStopIndex + 1, rowCount - 1);
          break;
        case "ArrowLeft":
          scrollToColumn = mode === "cells" ? Math.max(scrollToColumn - 1, 0) : Math.max(_this._columnStartIndex - 1, 0);
          break;
        case "ArrowRight":
          scrollToColumn = mode === "cells" ? Math.min(scrollToColumn + 1, columnCount - 1) : Math.min(_this._columnStopIndex + 1, columnCount - 1);
          break;
        case "ArrowUp":
          scrollToRow = mode === "cells" ? Math.max(scrollToRow - 1, 0) : Math.max(_this._rowStartIndex - 1, 0);
          break;
      }
      if (scrollToColumn !== scrollToColumnPrevious || scrollToRow !== scrollToRowPrevious) {
        event.preventDefault();
        _this._updateScrollState({
          scrollToColumn,
          scrollToRow
        });
      }
    });
    _defineProperty(_this, "_onSectionRendered", function(_ref) {
      var columnStartIndex = _ref.columnStartIndex, columnStopIndex = _ref.columnStopIndex, rowStartIndex = _ref.rowStartIndex, rowStopIndex = _ref.rowStopIndex;
      _this._columnStartIndex = columnStartIndex;
      _this._columnStopIndex = columnStopIndex;
      _this._rowStartIndex = rowStartIndex;
      _this._rowStopIndex = rowStopIndex;
    });
    return _this;
  }
  _inherits(ArrowKeyStepper2, _React$PureComponent);
  return _createClass(ArrowKeyStepper2, [{
    key: "setScrollIndexes",
    value: function setScrollIndexes(_ref2) {
      var scrollToColumn = _ref2.scrollToColumn, scrollToRow = _ref2.scrollToRow;
      this.setState({
        scrollToRow,
        scrollToColumn
      });
    }
  }, {
    key: "render",
    value: function render() {
      var _this$props2 = this.props, className = _this$props2.className, children = _this$props2.children;
      var _this$_getScrollState3 = this._getScrollState(), scrollToColumn = _this$_getScrollState3.scrollToColumn, scrollToRow = _this$_getScrollState3.scrollToRow;
      return /* @__PURE__ */ reactExports.createElement("div", {
        className,
        onKeyDown: this._onKeyDown
      }, children({
        onSectionRendered: this._onSectionRendered,
        scrollToColumn,
        scrollToRow
      }));
    }
  }, {
    key: "_getScrollState",
    value: function _getScrollState() {
      return this.props.isControlled ? this.props : this.state;
    }
  }, {
    key: "_updateScrollState",
    value: function _updateScrollState(_ref3) {
      var scrollToColumn = _ref3.scrollToColumn, scrollToRow = _ref3.scrollToRow;
      var _this$props3 = this.props, isControlled = _this$props3.isControlled, onScrollToChange = _this$props3.onScrollToChange;
      if (typeof onScrollToChange === "function") {
        onScrollToChange({
          scrollToColumn,
          scrollToRow
        });
      }
      if (!isControlled) {
        this.setState({
          scrollToColumn,
          scrollToRow
        });
      }
    }
  }], [{
    key: "getDerivedStateFromProps",
    value: function getDerivedStateFromProps(nextProps, prevState) {
      if (nextProps.isControlled) {
        return {};
      }
      if (nextProps.scrollToColumn !== prevState.instanceProps.prevScrollToColumn || nextProps.scrollToRow !== prevState.instanceProps.prevScrollToRow) {
        return _objectSpread$7(_objectSpread$7({}, prevState), {}, {
          scrollToColumn: nextProps.scrollToColumn,
          scrollToRow: nextProps.scrollToRow,
          instanceProps: {
            prevScrollToColumn: nextProps.scrollToColumn,
            prevScrollToRow: nextProps.scrollToRow
          }
        });
      }
      return {};
    }
  }]);
}(reactExports.PureComponent);
_defineProperty(ArrowKeyStepper, "defaultProps", {
  disabled: false,
  isControlled: false,
  mode: "edges",
  scrollToColumn: 0,
  scrollToRow: 0
});
polyfill(ArrowKeyStepper);
function createDetectElementResize(nonce, hostWindow) {
  var _window;
  if (typeof hostWindow !== "undefined") {
    _window = hostWindow;
  } else if (typeof window !== "undefined") {
    _window = window;
  } else if (typeof self !== "undefined") {
    _window = self;
  } else {
    _window = global;
  }
  var attachEvent = typeof _window.document !== "undefined" && _window.document.attachEvent;
  if (!attachEvent) {
    var requestFrame = function() {
      var raf2 = _window.requestAnimationFrame || _window.mozRequestAnimationFrame || _window.webkitRequestAnimationFrame || function(fn) {
        return _window.setTimeout(fn, 20);
      };
      return function(fn) {
        return raf2(fn);
      };
    }();
    var cancelFrame = function() {
      var cancel2 = _window.cancelAnimationFrame || _window.mozCancelAnimationFrame || _window.webkitCancelAnimationFrame || _window.clearTimeout;
      return function(id) {
        return cancel2(id);
      };
    }();
    var resetTriggers = function resetTriggers2(element) {
      var triggers = element.__resizeTriggers__, expand = triggers.firstElementChild, contract = triggers.lastElementChild, expandChild = expand.firstElementChild;
      contract.scrollLeft = contract.scrollWidth;
      contract.scrollTop = contract.scrollHeight;
      expandChild.style.width = expand.offsetWidth + 1 + "px";
      expandChild.style.height = expand.offsetHeight + 1 + "px";
      expand.scrollLeft = expand.scrollWidth;
      expand.scrollTop = expand.scrollHeight;
    };
    var checkTriggers = function checkTriggers2(element) {
      return element.offsetWidth != element.__resizeLast__.width || element.offsetHeight != element.__resizeLast__.height;
    };
    var scrollListener = function scrollListener2(e) {
      if (e.target.className && typeof e.target.className.indexOf === "function" && e.target.className.indexOf("contract-trigger") < 0 && e.target.className.indexOf("expand-trigger") < 0) {
        return;
      }
      var element = this;
      resetTriggers(this);
      if (this.__resizeRAF__) {
        cancelFrame(this.__resizeRAF__);
      }
      this.__resizeRAF__ = requestFrame(function() {
        if (checkTriggers(element)) {
          element.__resizeLast__.width = element.offsetWidth;
          element.__resizeLast__.height = element.offsetHeight;
          element.__resizeListeners__.forEach(function(fn) {
            fn.call(element, e);
          });
        }
      });
    };
    var animation = false, keyframeprefix = "", animationstartevent = "animationstart", domPrefixes = "Webkit Moz O ms".split(" "), startEvents = "webkitAnimationStart animationstart oAnimationStart MSAnimationStart".split(" "), pfx = "";
    {
      var elm = _window.document.createElement("fakeelement");
      if (elm.style.animationName !== void 0) {
        animation = true;
      }
      if (animation === false) {
        for (var i = 0; i < domPrefixes.length; i++) {
          if (elm.style[domPrefixes[i] + "AnimationName"] !== void 0) {
            pfx = domPrefixes[i];
            keyframeprefix = "-" + pfx.toLowerCase() + "-";
            animationstartevent = startEvents[i];
            animation = true;
            break;
          }
        }
      }
    }
    var animationName = "resizeanim";
    var animationKeyframes = "@" + keyframeprefix + "keyframes " + animationName + " { from { opacity: 0; } to { opacity: 0; } } ";
    var animationStyle = keyframeprefix + "animation: 1ms " + animationName + "; ";
  }
  var createStyles = function createStyles2(doc) {
    if (!doc.getElementById("detectElementResize")) {
      var css = (animationKeyframes ? animationKeyframes : "") + ".resize-triggers { " + (animationStyle ? animationStyle : "") + 'visibility: hidden; opacity: 0; } .resize-triggers, .resize-triggers > div, .contract-trigger:before { content: " "; display: block; position: absolute; top: 0; left: 0; height: 100%; width: 100%; overflow: hidden; z-index: -1; } .resize-triggers > div { background: #eee; overflow: auto; } .contract-trigger:before { width: 200%; height: 200%; }', head = doc.head || doc.getElementsByTagName("head")[0], style = doc.createElement("style");
      style.id = "detectElementResize";
      style.type = "text/css";
      if (nonce != null) {
        style.setAttribute("nonce", nonce);
      }
      if (style.styleSheet) {
        style.styleSheet.cssText = css;
      } else {
        style.appendChild(doc.createTextNode(css));
      }
      head.appendChild(style);
    }
  };
  var addResizeListener = function addResizeListener2(element, fn) {
    if (attachEvent) {
      element.attachEvent("onresize", fn);
    } else {
      if (!element.__resizeTriggers__) {
        var doc = element.ownerDocument;
        var elementStyle = _window.getComputedStyle(element);
        if (elementStyle && elementStyle.position == "static") {
          element.style.position = "relative";
        }
        createStyles(doc);
        element.__resizeLast__ = {};
        element.__resizeListeners__ = [];
        (element.__resizeTriggers__ = doc.createElement("div")).className = "resize-triggers";
        var expandTrigger = doc.createElement("div");
        expandTrigger.className = "expand-trigger";
        expandTrigger.appendChild(doc.createElement("div"));
        var contractTrigger = doc.createElement("div");
        contractTrigger.className = "contract-trigger";
        element.__resizeTriggers__.appendChild(expandTrigger);
        element.__resizeTriggers__.appendChild(contractTrigger);
        element.appendChild(element.__resizeTriggers__);
        resetTriggers(element);
        element.addEventListener("scroll", scrollListener, true);
        if (animationstartevent) {
          element.__resizeTriggers__.__animationListener__ = function animationListener(e) {
            if (e.animationName == animationName) {
              resetTriggers(element);
            }
          };
          element.__resizeTriggers__.addEventListener(animationstartevent, element.__resizeTriggers__.__animationListener__);
        }
      }
      element.__resizeListeners__.push(fn);
    }
  };
  var removeResizeListener = function removeResizeListener2(element, fn) {
    if (attachEvent) {
      element.detachEvent("onresize", fn);
    } else {
      element.__resizeListeners__.splice(element.__resizeListeners__.indexOf(fn), 1);
      if (!element.__resizeListeners__.length) {
        element.removeEventListener("scroll", scrollListener, true);
        if (element.__resizeTriggers__.__animationListener__) {
          element.__resizeTriggers__.removeEventListener(animationstartevent, element.__resizeTriggers__.__animationListener__);
          element.__resizeTriggers__.__animationListener__ = null;
        }
        try {
          element.__resizeTriggers__ = !element.removeChild(element.__resizeTriggers__);
        } catch (e) {
        }
      }
    }
  };
  return {
    addResizeListener,
    removeResizeListener
  };
}
function ownKeys$6(e, r2) {
  var t = Object.keys(e);
  if (Object.getOwnPropertySymbols) {
    var o = Object.getOwnPropertySymbols(e);
    r2 && (o = o.filter(function(r3) {
      return Object.getOwnPropertyDescriptor(e, r3).enumerable;
    })), t.push.apply(t, o);
  }
  return t;
}
function _objectSpread$6(e) {
  for (var r2 = 1; r2 < arguments.length; r2++) {
    var t = null != arguments[r2] ? arguments[r2] : {};
    r2 % 2 ? ownKeys$6(Object(t), true).forEach(function(r3) {
      _defineProperty(e, r3, t[r3]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys$6(Object(t)).forEach(function(r3) {
      Object.defineProperty(e, r3, Object.getOwnPropertyDescriptor(t, r3));
    });
  }
  return e;
}
function _callSuper$d(t, o, e) {
  return o = _getPrototypeOf(o), _possibleConstructorReturn(t, _isNativeReflectConstruct$d() ? Reflect.construct(o, e || [], _getPrototypeOf(t).constructor) : o.apply(t, e));
}
function _isNativeReflectConstruct$d() {
  try {
    var t = !Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {
    }));
  } catch (t2) {
  }
  return (_isNativeReflectConstruct$d = function _isNativeReflectConstruct2() {
    return !!t;
  })();
}
var AutoSizer = /* @__PURE__ */ function(_React$Component) {
  function AutoSizer2() {
    var _this;
    _classCallCheck(this, AutoSizer2);
    for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }
    _this = _callSuper$d(this, AutoSizer2, [].concat(args));
    _defineProperty(_this, "state", {
      height: _this.props.defaultHeight || 0,
      width: _this.props.defaultWidth || 0
    });
    _defineProperty(_this, "_parentNode", void 0);
    _defineProperty(_this, "_autoSizer", void 0);
    _defineProperty(_this, "_window", void 0);
    _defineProperty(_this, "_detectElementResize", void 0);
    _defineProperty(_this, "_onResize", function() {
      var _this$props = _this.props, disableHeight = _this$props.disableHeight, disableWidth = _this$props.disableWidth, onResize3 = _this$props.onResize;
      if (_this._parentNode) {
        var height = _this._parentNode.offsetHeight || 0;
        var width = _this._parentNode.offsetWidth || 0;
        var win2 = _this._window || window;
        var style = win2.getComputedStyle(_this._parentNode) || {};
        var paddingLeft = parseInt(style.paddingLeft, 10) || 0;
        var paddingRight = parseInt(style.paddingRight, 10) || 0;
        var paddingTop = parseInt(style.paddingTop, 10) || 0;
        var paddingBottom = parseInt(style.paddingBottom, 10) || 0;
        var newHeight = height - paddingTop - paddingBottom;
        var newWidth = width - paddingLeft - paddingRight;
        if (!disableHeight && _this.state.height !== newHeight || !disableWidth && _this.state.width !== newWidth) {
          _this.setState({
            height: height - paddingTop - paddingBottom,
            width: width - paddingLeft - paddingRight
          });
          onResize3({
            height,
            width
          });
        }
      }
    });
    _defineProperty(_this, "_setRef", function(autoSizer) {
      _this._autoSizer = autoSizer;
    });
    return _this;
  }
  _inherits(AutoSizer2, _React$Component);
  return _createClass(AutoSizer2, [{
    key: "componentDidMount",
    value: function componentDidMount() {
      var nonce = this.props.nonce;
      if (this._autoSizer && this._autoSizer.parentNode && this._autoSizer.parentNode.ownerDocument && this._autoSizer.parentNode.ownerDocument.defaultView && this._autoSizer.parentNode instanceof this._autoSizer.parentNode.ownerDocument.defaultView.HTMLElement) {
        this._parentNode = this._autoSizer.parentNode;
        this._window = this._autoSizer.parentNode.ownerDocument.defaultView;
        this._detectElementResize = createDetectElementResize(nonce, this._window);
        this._detectElementResize.addResizeListener(this._parentNode, this._onResize);
        this._onResize();
      }
    }
  }, {
    key: "componentWillUnmount",
    value: function componentWillUnmount() {
      if (this._detectElementResize && this._parentNode) {
        this._detectElementResize.removeResizeListener(this._parentNode, this._onResize);
      }
    }
  }, {
    key: "render",
    value: function render() {
      var _this$props2 = this.props, children = _this$props2.children, className = _this$props2.className, disableHeight = _this$props2.disableHeight, disableWidth = _this$props2.disableWidth, style = _this$props2.style;
      var _this$state = this.state, height = _this$state.height, width = _this$state.width;
      var outerStyle = {
        overflow: "visible"
      };
      var childParams = {};
      if (!disableHeight) {
        outerStyle.height = 0;
        childParams.height = height;
      }
      if (!disableWidth) {
        outerStyle.width = 0;
        childParams.width = width;
      }
      return /* @__PURE__ */ reactExports.createElement("div", {
        className,
        ref: this._setRef,
        style: _objectSpread$6(_objectSpread$6({}, outerStyle), style)
      }, children(childParams));
    }
  }]);
}(reactExports.Component);
_defineProperty(AutoSizer, "defaultProps", {
  onResize: function onResize() {
  },
  disableHeight: false,
  disableWidth: false,
  style: {}
});
function _callSuper$c(t, o, e) {
  return o = _getPrototypeOf(o), _possibleConstructorReturn(t, _isNativeReflectConstruct$c() ? Reflect.construct(o, e || [], _getPrototypeOf(t).constructor) : o.apply(t, e));
}
function _isNativeReflectConstruct$c() {
  try {
    var t = !Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {
    }));
  } catch (t2) {
  }
  return (_isNativeReflectConstruct$c = function _isNativeReflectConstruct2() {
    return !!t;
  })();
}
var CellMeasurer = /* @__PURE__ */ function(_React$PureComponent) {
  function CellMeasurer2() {
    var _this;
    _classCallCheck(this, CellMeasurer2);
    for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }
    _this = _callSuper$c(this, CellMeasurer2, [].concat(args));
    _defineProperty(_this, "_child", /* @__PURE__ */ reactExports.createRef());
    _defineProperty(_this, "_measure", function() {
      var _this$props = _this.props, cache = _this$props.cache, _this$props$columnInd = _this$props.columnIndex, columnIndex = _this$props$columnInd === void 0 ? 0 : _this$props$columnInd, parent = _this$props.parent, _this$props$rowIndex = _this$props.rowIndex, rowIndex = _this$props$rowIndex === void 0 ? _this.props.index || 0 : _this$props$rowIndex;
      var _this$_getCellMeasure = _this._getCellMeasurements(), height = _this$_getCellMeasure.height, width = _this$_getCellMeasure.width;
      if (height !== cache.getHeight(rowIndex, columnIndex) || width !== cache.getWidth(rowIndex, columnIndex)) {
        cache.set(rowIndex, columnIndex, width, height);
        if (parent && typeof parent.recomputeGridSize === "function") {
          parent.recomputeGridSize({
            columnIndex,
            rowIndex
          });
        }
      }
    });
    _defineProperty(_this, "_registerChild", function(element) {
      if (element && !(element instanceof Element)) {
        console.warn("CellMeasurer registerChild expects to be passed Element or null");
      }
      _this._child.current = element;
      if (element) {
        _this._maybeMeasureCell();
      }
    });
    return _this;
  }
  _inherits(CellMeasurer2, _React$PureComponent);
  return _createClass(CellMeasurer2, [{
    key: "componentDidMount",
    value: function componentDidMount() {
      this._maybeMeasureCell();
    }
  }, {
    key: "componentDidUpdate",
    value: function componentDidUpdate() {
      this._maybeMeasureCell();
    }
  }, {
    key: "render",
    value: function render() {
      var _this2 = this;
      var children = this.props.children;
      var resolvedChildren = typeof children === "function" ? children({
        measure: this._measure,
        registerChild: this._registerChild
      }) : children;
      if (resolvedChildren === null) {
        return resolvedChildren;
      }
      return /* @__PURE__ */ reactExports.cloneElement(resolvedChildren, {
        ref: function ref(node) {
          if (typeof resolvedChildren.ref === "function") {
            resolvedChildren.ref(node);
          } else if (resolvedChildren.ref) {
            resolvedChildren.ref.current = node;
          }
          _this2._child.current = node;
        }
      });
    }
  }, {
    key: "_getCellMeasurements",
    value: function _getCellMeasurements() {
      var cache = this.props.cache;
      var node = this._child.current;
      if (node && node.ownerDocument && node.ownerDocument.defaultView && node instanceof node.ownerDocument.defaultView.HTMLElement) {
        var styleWidth = node.style.width;
        var styleHeight = node.style.height;
        if (!cache.hasFixedWidth()) {
          node.style.width = "auto";
        }
        if (!cache.hasFixedHeight()) {
          node.style.height = "auto";
        }
        var height = Math.ceil(node.offsetHeight);
        var width = Math.ceil(node.offsetWidth);
        if (styleWidth) {
          node.style.width = styleWidth;
        }
        if (styleHeight) {
          node.style.height = styleHeight;
        }
        return {
          height,
          width
        };
      } else {
        return {
          height: 0,
          width: 0
        };
      }
    }
  }, {
    key: "_maybeMeasureCell",
    value: function _maybeMeasureCell() {
      var _this$props2 = this.props, cache = _this$props2.cache, _this$props2$columnIn = _this$props2.columnIndex, columnIndex = _this$props2$columnIn === void 0 ? 0 : _this$props2$columnIn, parent = _this$props2.parent, _this$props2$rowIndex = _this$props2.rowIndex, rowIndex = _this$props2$rowIndex === void 0 ? this.props.index || 0 : _this$props2$rowIndex;
      if (!cache.has(rowIndex, columnIndex)) {
        var _this$_getCellMeasure2 = this._getCellMeasurements(), height = _this$_getCellMeasure2.height, width = _this$_getCellMeasure2.width;
        cache.set(rowIndex, columnIndex, width, height);
        if (parent && typeof parent.invalidateCellSizeAfterRender === "function") {
          parent.invalidateCellSizeAfterRender({
            columnIndex,
            rowIndex
          });
        }
      }
    }
  }]);
}(reactExports.PureComponent);
_defineProperty(CellMeasurer, "__internalCellMeasurerFlag", false);
var DEFAULT_HEIGHT = 30;
var DEFAULT_WIDTH = 100;
var CellMeasurerCache = /* @__PURE__ */ function() {
  function CellMeasurerCache2() {
    var _this = this;
    var params = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
    _classCallCheck(this, CellMeasurerCache2);
    _defineProperty(this, "_cellHeightCache", {});
    _defineProperty(this, "_cellWidthCache", {});
    _defineProperty(this, "_columnWidthCache", {});
    _defineProperty(this, "_rowHeightCache", {});
    _defineProperty(this, "_defaultHeight", void 0);
    _defineProperty(this, "_defaultWidth", void 0);
    _defineProperty(this, "_minHeight", void 0);
    _defineProperty(this, "_minWidth", void 0);
    _defineProperty(this, "_keyMapper", void 0);
    _defineProperty(this, "_hasFixedHeight", void 0);
    _defineProperty(this, "_hasFixedWidth", void 0);
    _defineProperty(this, "_columnCount", 0);
    _defineProperty(this, "_rowCount", 0);
    _defineProperty(this, "columnWidth", function(_ref) {
      var index = _ref.index;
      var key = _this._keyMapper(0, index);
      return _this._columnWidthCache[key] !== void 0 ? _this._columnWidthCache[key] : _this._defaultWidth;
    });
    _defineProperty(this, "rowHeight", function(_ref2) {
      var index = _ref2.index;
      var key = _this._keyMapper(index, 0);
      return _this._rowHeightCache[key] !== void 0 ? _this._rowHeightCache[key] : _this._defaultHeight;
    });
    var defaultHeight = params.defaultHeight, defaultWidth = params.defaultWidth, fixedHeight = params.fixedHeight, fixedWidth = params.fixedWidth, keyMapper = params.keyMapper, minHeight = params.minHeight, minWidth = params.minWidth;
    this._hasFixedHeight = fixedHeight === true;
    this._hasFixedWidth = fixedWidth === true;
    this._minHeight = minHeight || 0;
    this._minWidth = minWidth || 0;
    this._keyMapper = keyMapper || defaultKeyMapper;
    this._defaultHeight = Math.max(this._minHeight, typeof defaultHeight === "number" ? defaultHeight : DEFAULT_HEIGHT);
    this._defaultWidth = Math.max(this._minWidth, typeof defaultWidth === "number" ? defaultWidth : DEFAULT_WIDTH);
  }
  return _createClass(CellMeasurerCache2, [{
    key: "clear",
    value: function clear(rowIndex) {
      var columnIndex = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : 0;
      var key = this._keyMapper(rowIndex, columnIndex);
      delete this._cellHeightCache[key];
      delete this._cellWidthCache[key];
      this._updateCachedColumnAndRowSizes(rowIndex, columnIndex);
    }
  }, {
    key: "clearAll",
    value: function clearAll() {
      this._cellHeightCache = {};
      this._cellWidthCache = {};
      this._columnWidthCache = {};
      this._rowHeightCache = {};
      this._rowCount = 0;
      this._columnCount = 0;
    }
  }, {
    key: "defaultHeight",
    get: function get3() {
      return this._defaultHeight;
    }
  }, {
    key: "defaultWidth",
    get: function get3() {
      return this._defaultWidth;
    }
  }, {
    key: "hasFixedHeight",
    value: function hasFixedHeight() {
      return this._hasFixedHeight;
    }
  }, {
    key: "hasFixedWidth",
    value: function hasFixedWidth() {
      return this._hasFixedWidth;
    }
  }, {
    key: "getHeight",
    value: function getHeight(rowIndex) {
      var columnIndex = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : 0;
      if (this._hasFixedHeight) {
        return this._defaultHeight;
      } else {
        var _key = this._keyMapper(rowIndex, columnIndex);
        return this._cellHeightCache[_key] !== void 0 ? Math.max(this._minHeight, this._cellHeightCache[_key]) : this._defaultHeight;
      }
    }
  }, {
    key: "getWidth",
    value: function getWidth(rowIndex) {
      var columnIndex = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : 0;
      if (this._hasFixedWidth) {
        return this._defaultWidth;
      } else {
        var _key2 = this._keyMapper(rowIndex, columnIndex);
        return this._cellWidthCache[_key2] !== void 0 ? Math.max(this._minWidth, this._cellWidthCache[_key2]) : this._defaultWidth;
      }
    }
  }, {
    key: "has",
    value: function has(rowIndex) {
      var columnIndex = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : 0;
      var key = this._keyMapper(rowIndex, columnIndex);
      return this._cellHeightCache[key] !== void 0;
    }
  }, {
    key: "set",
    value: function set(rowIndex, columnIndex, width, height) {
      var key = this._keyMapper(rowIndex, columnIndex);
      if (columnIndex >= this._columnCount) {
        this._columnCount = columnIndex + 1;
      }
      if (rowIndex >= this._rowCount) {
        this._rowCount = rowIndex + 1;
      }
      this._cellHeightCache[key] = height;
      this._cellWidthCache[key] = width;
      this._updateCachedColumnAndRowSizes(rowIndex, columnIndex);
    }
  }, {
    key: "_updateCachedColumnAndRowSizes",
    value: function _updateCachedColumnAndRowSizes(rowIndex, columnIndex) {
      if (!this._hasFixedWidth) {
        var columnWidth = 0;
        for (var i = 0; i < this._rowCount; i++) {
          columnWidth = Math.max(columnWidth, this.getWidth(i, columnIndex));
        }
        var columnKey = this._keyMapper(0, columnIndex);
        this._columnWidthCache[columnKey] = columnWidth;
      }
      if (!this._hasFixedHeight) {
        var rowHeight = 0;
        for (var _i = 0; _i < this._columnCount; _i++) {
          rowHeight = Math.max(rowHeight, this.getHeight(rowIndex, _i));
        }
        var rowKey = this._keyMapper(rowIndex, 0);
        this._rowHeightCache[rowKey] = rowHeight;
      }
    }
  }]);
}();
function defaultKeyMapper(rowIndex, columnIndex) {
  return "".concat(rowIndex, "-").concat(columnIndex);
}
function r(e) {
  var t, f, n = "";
  if ("string" == typeof e || "number" == typeof e) n += e;
  else if ("object" == typeof e) if (Array.isArray(e)) for (t = 0; t < e.length; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
  else for (t in e) e[t] && (n && (n += " "), n += t);
  return n;
}
function clsx() {
  for (var e, t, f = 0, n = ""; f < arguments.length; ) (e = arguments[f++]) && (t = r(e)) && (n && (n += " "), n += t);
  return n;
}
function createCallbackMemoizer() {
  var requireAllKeys = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : true;
  var cachedIndices = {};
  return function(_ref) {
    var callback = _ref.callback, indices = _ref.indices;
    var keys = Object.keys(indices);
    var allInitialized = !requireAllKeys || keys.every(function(key) {
      var value = indices[key];
      return Array.isArray(value) ? value.length > 0 : value >= 0;
    });
    var indexChanged = keys.length !== Object.keys(cachedIndices).length || keys.some(function(key) {
      var cachedValue = cachedIndices[key];
      var value = indices[key];
      return Array.isArray(value) ? cachedValue.join(",") !== value.join(",") : cachedValue !== value;
    });
    cachedIndices = indices;
    if (allInitialized && indexChanged) {
      callback(indices);
    }
  };
}
function ownKeys$5(e, r2) {
  var t = Object.keys(e);
  if (Object.getOwnPropertySymbols) {
    var o = Object.getOwnPropertySymbols(e);
    r2 && (o = o.filter(function(r22) {
      return Object.getOwnPropertyDescriptor(e, r22).enumerable;
    })), t.push.apply(t, o);
  }
  return t;
}
function _objectSpread$5(e) {
  for (var r2 = 1; r2 < arguments.length; r2++) {
    var t = null != arguments[r2] ? arguments[r2] : {};
    r2 % 2 ? ownKeys$5(Object(t), true).forEach(function(r22) {
      _defineProperty(e, r22, t[r22]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys$5(Object(t)).forEach(function(r22) {
      Object.defineProperty(e, r22, Object.getOwnPropertyDescriptor(t, r22));
    });
  }
  return e;
}
function _callSuper$b(t, o, e) {
  return o = _getPrototypeOf(o), _possibleConstructorReturn(t, _isNativeReflectConstruct$b() ? Reflect.construct(o, e || [], _getPrototypeOf(t).constructor) : o.apply(t, e));
}
function _isNativeReflectConstruct$b() {
  try {
    var t = !Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {
    }));
  } catch (t2) {
  }
  return (_isNativeReflectConstruct$b = function _isNativeReflectConstruct2() {
    return !!t;
  })();
}
var IS_SCROLLING_TIMEOUT$1 = 150;
var SCROLL_POSITION_CHANGE_REASONS$1 = {
  OBSERVED: "observed",
  REQUESTED: "requested"
};
var CollectionView = /* @__PURE__ */ function(_React$PureComponent) {
  function CollectionView2() {
    var _this;
    _classCallCheck(this, CollectionView2);
    for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }
    _this = _callSuper$b(this, CollectionView2, [].concat(args));
    _defineProperty(_this, "state", {
      isScrolling: false,
      scrollLeft: 0,
      scrollTop: 0
    });
    _defineProperty(_this, "_calculateSizeAndPositionDataOnNextUpdate", false);
    _defineProperty(_this, "_onSectionRenderedMemoizer", createCallbackMemoizer());
    _defineProperty(_this, "_onScrollMemoizer", createCallbackMemoizer(false));
    _defineProperty(_this, "_invokeOnSectionRenderedHelper", function() {
      var _this$props = _this.props, cellLayoutManager = _this$props.cellLayoutManager, onSectionRendered22 = _this$props.onSectionRendered;
      _this._onSectionRenderedMemoizer({
        callback: onSectionRendered22,
        indices: {
          indices: cellLayoutManager.getLastRenderedIndices()
        }
      });
    });
    _defineProperty(_this, "_setScrollingContainerRef", function(ref) {
      _this._scrollingContainer = ref;
    });
    _defineProperty(_this, "_updateScrollPositionForScrollToCell", function() {
      var _this$props2 = _this.props, cellLayoutManager = _this$props2.cellLayoutManager, height = _this$props2.height, scrollToAlignment = _this$props2.scrollToAlignment, scrollToCell = _this$props2.scrollToCell, width = _this$props2.width;
      var _this$state = _this.state, scrollLeft = _this$state.scrollLeft, scrollTop = _this$state.scrollTop;
      if (scrollToCell >= 0) {
        var scrollPosition = cellLayoutManager.getScrollPositionForCell({
          align: scrollToAlignment,
          cellIndex: scrollToCell,
          height,
          scrollLeft,
          scrollTop,
          width
        });
        if (scrollPosition.scrollLeft !== scrollLeft || scrollPosition.scrollTop !== scrollTop) {
          _this._setScrollPosition(scrollPosition);
        }
      }
    });
    _defineProperty(_this, "_onScroll", function(event) {
      if (event.target !== _this._scrollingContainer) {
        return;
      }
      _this._enablePointerEventsAfterDelay();
      var _this$props3 = _this.props, cellLayoutManager = _this$props3.cellLayoutManager, height = _this$props3.height, isScrollingChange = _this$props3.isScrollingChange, width = _this$props3.width;
      var scrollbarSize2 = _this._scrollbarSize;
      var _cellLayoutManager$ge = cellLayoutManager.getTotalSize(), totalHeight = _cellLayoutManager$ge.height, totalWidth = _cellLayoutManager$ge.width;
      var scrollLeft = Math.max(0, Math.min(totalWidth - width + scrollbarSize2, event.target.scrollLeft));
      var scrollTop = Math.max(0, Math.min(totalHeight - height + scrollbarSize2, event.target.scrollTop));
      if (_this.state.scrollLeft !== scrollLeft || _this.state.scrollTop !== scrollTop) {
        var scrollPositionChangeReason = event.cancelable ? SCROLL_POSITION_CHANGE_REASONS$1.OBSERVED : SCROLL_POSITION_CHANGE_REASONS$1.REQUESTED;
        if (!_this.state.isScrolling) {
          isScrollingChange(true);
        }
        _this.setState({
          isScrolling: true,
          scrollLeft,
          scrollPositionChangeReason,
          scrollTop
        });
      }
      _this._invokeOnScrollMemoizer({
        scrollLeft,
        scrollTop,
        totalWidth,
        totalHeight
      });
    });
    _this._scrollbarSize = scrollbarSize();
    if (_this._scrollbarSize === void 0) {
      _this._scrollbarSizeMeasured = false;
      _this._scrollbarSize = 0;
    } else {
      _this._scrollbarSizeMeasured = true;
    }
    return _this;
  }
  _inherits(CollectionView2, _React$PureComponent);
  return _createClass(CollectionView2, [{
    key: "recomputeCellSizesAndPositions",
    value: function recomputeCellSizesAndPositions() {
      this._calculateSizeAndPositionDataOnNextUpdate = true;
      this.forceUpdate();
    }
    /* ---------------------------- Component lifecycle methods ---------------------------- */
    /**
     * @private
     * This method updates scrollLeft/scrollTop in state for the following conditions:
     * 1) Empty content (0 rows or columns)
     * 2) New scroll props overriding the current state
     * 3) Cells-count or cells-size has changed, making previous scroll offsets invalid
     */
  }, {
    key: "componentDidMount",
    value: function componentDidMount() {
      var _this$props4 = this.props, cellLayoutManager = _this$props4.cellLayoutManager, scrollLeft = _this$props4.scrollLeft, scrollToCell = _this$props4.scrollToCell, scrollTop = _this$props4.scrollTop;
      if (!this._scrollbarSizeMeasured) {
        this._scrollbarSize = scrollbarSize();
        this._scrollbarSizeMeasured = true;
        this.setState({});
      }
      if (scrollToCell >= 0) {
        this._updateScrollPositionForScrollToCell();
      } else if (scrollLeft >= 0 || scrollTop >= 0) {
        this._setScrollPosition({
          scrollLeft,
          scrollTop
        });
      }
      this._invokeOnSectionRenderedHelper();
      var _cellLayoutManager$ge2 = cellLayoutManager.getTotalSize(), totalHeight = _cellLayoutManager$ge2.height, totalWidth = _cellLayoutManager$ge2.width;
      this._invokeOnScrollMemoizer({
        scrollLeft: scrollLeft || 0,
        scrollTop: scrollTop || 0,
        totalHeight,
        totalWidth
      });
    }
  }, {
    key: "componentDidUpdate",
    value: function componentDidUpdate(prevProps, prevState) {
      var _this$props5 = this.props, height = _this$props5.height, scrollToAlignment = _this$props5.scrollToAlignment, scrollToCell = _this$props5.scrollToCell, width = _this$props5.width;
      var _this$state2 = this.state, scrollLeft = _this$state2.scrollLeft, scrollPositionChangeReason = _this$state2.scrollPositionChangeReason, scrollTop = _this$state2.scrollTop;
      if (scrollPositionChangeReason === SCROLL_POSITION_CHANGE_REASONS$1.REQUESTED) {
        if (scrollLeft >= 0 && scrollLeft !== prevState.scrollLeft && scrollLeft !== this._scrollingContainer.scrollLeft) {
          this._scrollingContainer.scrollLeft = scrollLeft;
        }
        if (scrollTop >= 0 && scrollTop !== prevState.scrollTop && scrollTop !== this._scrollingContainer.scrollTop) {
          this._scrollingContainer.scrollTop = scrollTop;
        }
      }
      if (height !== prevProps.height || scrollToAlignment !== prevProps.scrollToAlignment || scrollToCell !== prevProps.scrollToCell || width !== prevProps.width) {
        this._updateScrollPositionForScrollToCell();
      }
      this._invokeOnSectionRenderedHelper();
    }
  }, {
    key: "componentWillUnmount",
    value: function componentWillUnmount() {
      if (this._disablePointerEventsTimeoutId) {
        clearTimeout(this._disablePointerEventsTimeoutId);
      }
    }
  }, {
    key: "render",
    value: function render() {
      var _this$props6 = this.props, autoHeight = _this$props6.autoHeight, cellCount = _this$props6.cellCount, cellLayoutManager = _this$props6.cellLayoutManager, className = _this$props6.className, height = _this$props6.height, horizontalOverscanSize = _this$props6.horizontalOverscanSize, id = _this$props6.id, noContentRenderer2 = _this$props6.noContentRenderer, style = _this$props6.style, verticalOverscanSize = _this$props6.verticalOverscanSize, width = _this$props6.width;
      var _this$state3 = this.state, isScrolling = _this$state3.isScrolling, scrollLeft = _this$state3.scrollLeft, scrollTop = _this$state3.scrollTop;
      if (this._lastRenderedCellCount !== cellCount || this._lastRenderedCellLayoutManager !== cellLayoutManager || this._calculateSizeAndPositionDataOnNextUpdate) {
        this._lastRenderedCellCount = cellCount;
        this._lastRenderedCellLayoutManager = cellLayoutManager;
        this._calculateSizeAndPositionDataOnNextUpdate = false;
        cellLayoutManager.calculateSizeAndPositionData();
      }
      var _cellLayoutManager$ge3 = cellLayoutManager.getTotalSize(), totalHeight = _cellLayoutManager$ge3.height, totalWidth = _cellLayoutManager$ge3.width;
      var left = Math.max(0, scrollLeft - horizontalOverscanSize);
      var top = Math.max(0, scrollTop - verticalOverscanSize);
      var right = Math.min(totalWidth, scrollLeft + width + horizontalOverscanSize);
      var bottom = Math.min(totalHeight, scrollTop + height + verticalOverscanSize);
      var childrenToDisplay = height > 0 && width > 0 ? cellLayoutManager.cellRenderers({
        height: bottom - top,
        isScrolling,
        width: right - left,
        x: left,
        y: top
      }) : [];
      var collectionStyle = {
        boxSizing: "border-box",
        direction: "ltr",
        height: autoHeight ? "auto" : height,
        position: "relative",
        WebkitOverflowScrolling: "touch",
        width,
        willChange: "transform"
      };
      var verticalScrollBarSize = totalHeight > height ? this._scrollbarSize : 0;
      var horizontalScrollBarSize = totalWidth > width ? this._scrollbarSize : 0;
      collectionStyle.overflowX = totalWidth + verticalScrollBarSize <= width ? "hidden" : "auto";
      collectionStyle.overflowY = totalHeight + horizontalScrollBarSize <= height ? "hidden" : "auto";
      return /* @__PURE__ */ reactExports.createElement("div", {
        ref: this._setScrollingContainerRef,
        "aria-label": this.props["aria-label"],
        className: clsx("ReactVirtualized__Collection", className),
        id,
        onScroll: this._onScroll,
        role: "grid",
        style: _objectSpread$5(_objectSpread$5({}, collectionStyle), style),
        tabIndex: 0
      }, cellCount > 0 && /* @__PURE__ */ reactExports.createElement("div", {
        className: "ReactVirtualized__Collection__innerScrollContainer",
        style: {
          height: totalHeight,
          maxHeight: totalHeight,
          maxWidth: totalWidth,
          overflow: "hidden",
          pointerEvents: isScrolling ? "none" : "",
          width: totalWidth
        }
      }, childrenToDisplay), cellCount === 0 && noContentRenderer2());
    }
    /* ---------------------------- Helper methods ---------------------------- */
    /**
     * Sets an :isScrolling flag for a small window of time.
     * This flag is used to disable pointer events on the scrollable portion of the Collection.
     * This prevents jerky/stuttery mouse-wheel scrolling.
     */
  }, {
    key: "_enablePointerEventsAfterDelay",
    value: function _enablePointerEventsAfterDelay() {
      var _this2 = this;
      if (this._disablePointerEventsTimeoutId) {
        clearTimeout(this._disablePointerEventsTimeoutId);
      }
      this._disablePointerEventsTimeoutId = setTimeout(function() {
        var isScrollingChange = _this2.props.isScrollingChange;
        isScrollingChange(false);
        _this2._disablePointerEventsTimeoutId = null;
        _this2.setState({
          isScrolling: false
        });
      }, IS_SCROLLING_TIMEOUT$1);
    }
  }, {
    key: "_invokeOnScrollMemoizer",
    value: function _invokeOnScrollMemoizer(_ref) {
      var _this3 = this;
      var scrollLeft = _ref.scrollLeft, scrollTop = _ref.scrollTop, totalHeight = _ref.totalHeight, totalWidth = _ref.totalWidth;
      this._onScrollMemoizer({
        callback: function callback(_ref2) {
          var scrollLeft2 = _ref2.scrollLeft, scrollTop2 = _ref2.scrollTop;
          var _this3$props = _this3.props, height = _this3$props.height, onScroll22 = _this3$props.onScroll, width = _this3$props.width;
          onScroll22({
            clientHeight: height,
            clientWidth: width,
            scrollHeight: totalHeight,
            scrollLeft: scrollLeft2,
            scrollTop: scrollTop2,
            scrollWidth: totalWidth
          });
        },
        indices: {
          scrollLeft,
          scrollTop
        }
      });
    }
  }, {
    key: "_setScrollPosition",
    value: function _setScrollPosition(_ref3) {
      var scrollLeft = _ref3.scrollLeft, scrollTop = _ref3.scrollTop;
      var newState = {
        scrollPositionChangeReason: SCROLL_POSITION_CHANGE_REASONS$1.REQUESTED
      };
      if (scrollLeft >= 0) {
        newState.scrollLeft = scrollLeft;
      }
      if (scrollTop >= 0) {
        newState.scrollTop = scrollTop;
      }
      if (scrollLeft >= 0 && scrollLeft !== this.state.scrollLeft || scrollTop >= 0 && scrollTop !== this.state.scrollTop) {
        this.setState(newState);
      }
    }
  }], [{
    key: "getDerivedStateFromProps",
    value: function getDerivedStateFromProps(nextProps, prevState) {
      if (nextProps.cellCount === 0 && (prevState.scrollLeft !== 0 || prevState.scrollTop !== 0)) {
        return {
          scrollLeft: 0,
          scrollTop: 0,
          scrollPositionChangeReason: SCROLL_POSITION_CHANGE_REASONS$1.REQUESTED
        };
      } else if (nextProps.scrollLeft !== prevState.scrollLeft || nextProps.scrollTop !== prevState.scrollTop) {
        return {
          scrollLeft: nextProps.scrollLeft != null ? nextProps.scrollLeft : prevState.scrollLeft,
          scrollTop: nextProps.scrollTop != null ? nextProps.scrollTop : prevState.scrollTop,
          scrollPositionChangeReason: SCROLL_POSITION_CHANGE_REASONS$1.REQUESTED
        };
      }
      return null;
    }
  }]);
}(reactExports.PureComponent);
_defineProperty(CollectionView, "defaultProps", {
  "aria-label": "grid",
  horizontalOverscanSize: 0,
  noContentRenderer: function noContentRenderer() {
    return null;
  },
  onScroll: function onScroll() {
    return null;
  },
  onSectionRendered: function onSectionRendered() {
    return null;
  },
  scrollToAlignment: "auto",
  scrollToCell: -1,
  style: {},
  verticalOverscanSize: 0
});
CollectionView.propTypes = {};
polyfill(CollectionView);
var Section = /* @__PURE__ */ function() {
  function Section2(_ref) {
    var height = _ref.height, width = _ref.width, x = _ref.x, y = _ref.y;
    _classCallCheck(this, Section2);
    this.height = height;
    this.width = width;
    this.x = x;
    this.y = y;
    this._indexMap = {};
    this._indices = [];
  }
  return _createClass(Section2, [{
    key: "addCellIndex",
    value: function addCellIndex(_ref2) {
      var index = _ref2.index;
      if (!this._indexMap[index]) {
        this._indexMap[index] = true;
        this._indices.push(index);
      }
    }
    /** Get all cell indices that have been added to this section. */
  }, {
    key: "getCellIndices",
    value: function getCellIndices() {
      return this._indices;
    }
    /** Intended for debugger/test purposes only */
  }, {
    key: "toString",
    value: function toString() {
      return "".concat(this.x, ",").concat(this.y, " ").concat(this.width, "x").concat(this.height);
    }
  }]);
}();
var SECTION_SIZE = 100;
var SectionManager = /* @__PURE__ */ function() {
  function SectionManager2() {
    var sectionSize = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : SECTION_SIZE;
    _classCallCheck(this, SectionManager2);
    this._sectionSize = sectionSize;
    this._cellMetadata = [];
    this._sections = {};
  }
  return _createClass(SectionManager2, [{
    key: "getCellIndices",
    value: function getCellIndices(_ref) {
      var height = _ref.height, width = _ref.width, x = _ref.x, y = _ref.y;
      var indices = {};
      this.getSections({
        height,
        width,
        x,
        y
      }).forEach(function(section) {
        return section.getCellIndices().forEach(function(index) {
          indices[index] = index;
        });
      });
      return Object.keys(indices).map(function(index) {
        return indices[index];
      });
    }
    /** Get size and position information for the cell specified. */
  }, {
    key: "getCellMetadata",
    value: function getCellMetadata(_ref2) {
      var index = _ref2.index;
      return this._cellMetadata[index];
    }
    /** Get all Sections overlapping the specified region. */
  }, {
    key: "getSections",
    value: function getSections(_ref3) {
      var height = _ref3.height, width = _ref3.width, x = _ref3.x, y = _ref3.y;
      var sectionXStart = Math.floor(x / this._sectionSize);
      var sectionXStop = Math.floor((x + width - 1) / this._sectionSize);
      var sectionYStart = Math.floor(y / this._sectionSize);
      var sectionYStop = Math.floor((y + height - 1) / this._sectionSize);
      var sections = [];
      for (var sectionX = sectionXStart; sectionX <= sectionXStop; sectionX++) {
        for (var sectionY = sectionYStart; sectionY <= sectionYStop; sectionY++) {
          var key = "".concat(sectionX, ".").concat(sectionY);
          if (!this._sections[key]) {
            this._sections[key] = new Section({
              height: this._sectionSize,
              width: this._sectionSize,
              x: sectionX * this._sectionSize,
              y: sectionY * this._sectionSize
            });
          }
          sections.push(this._sections[key]);
        }
      }
      return sections;
    }
    /** Total number of Sections based on the currently registered cells. */
  }, {
    key: "getTotalSectionCount",
    value: function getTotalSectionCount() {
      return Object.keys(this._sections).length;
    }
    /** Intended for debugger/test purposes only */
  }, {
    key: "toString",
    value: function toString() {
      var _this = this;
      return Object.keys(this._sections).map(function(index) {
        return _this._sections[index].toString();
      });
    }
    /** Adds a cell to the appropriate Sections and registers it metadata for later retrievable. */
  }, {
    key: "registerCell",
    value: function registerCell(_ref4) {
      var cellMetadatum = _ref4.cellMetadatum, index = _ref4.index;
      this._cellMetadata[index] = cellMetadatum;
      this.getSections(cellMetadatum).forEach(function(section) {
        return section.addCellIndex({
          index
        });
      });
    }
  }]);
}();
function calculateSizeAndPositionData(_ref) {
  var cellCount = _ref.cellCount, cellSizeAndPositionGetter = _ref.cellSizeAndPositionGetter, sectionSize = _ref.sectionSize;
  var cellMetadata = [];
  var sectionManager = new SectionManager(sectionSize);
  var height = 0;
  var width = 0;
  for (var index = 0; index < cellCount; index++) {
    var cellMetadatum = cellSizeAndPositionGetter({
      index
    });
    if (cellMetadatum.height == null || isNaN(cellMetadatum.height) || cellMetadatum.width == null || isNaN(cellMetadatum.width) || cellMetadatum.x == null || isNaN(cellMetadatum.x) || cellMetadatum.y == null || isNaN(cellMetadatum.y)) {
      throw Error("Invalid metadata returned for cell ".concat(index, ":\n        x:").concat(cellMetadatum.x, ", y:").concat(cellMetadatum.y, ", width:").concat(cellMetadatum.width, ", height:").concat(cellMetadatum.height));
    }
    height = Math.max(height, cellMetadatum.y + cellMetadatum.height);
    width = Math.max(width, cellMetadatum.x + cellMetadatum.width);
    cellMetadata[index] = cellMetadatum;
    sectionManager.registerCell({
      cellMetadatum,
      index
    });
  }
  return {
    cellMetadata,
    height,
    sectionManager,
    width
  };
}
function getUpdatedOffsetForIndex(_ref) {
  var _ref$align = _ref.align, align = _ref$align === void 0 ? "auto" : _ref$align, cellOffset = _ref.cellOffset, cellSize = _ref.cellSize, containerSize = _ref.containerSize, currentOffset = _ref.currentOffset;
  var maxOffset = cellOffset;
  var minOffset = maxOffset - containerSize + cellSize;
  switch (align) {
    case "start":
      return maxOffset;
    case "end":
      return minOffset;
    case "center":
      return maxOffset - (containerSize - cellSize) / 2;
    default:
      return Math.max(minOffset, Math.min(maxOffset, currentOffset));
  }
}
function _callSuper$a(t, o, e) {
  return o = _getPrototypeOf(o), _possibleConstructorReturn(t, _isNativeReflectConstruct$a() ? Reflect.construct(o, e || [], _getPrototypeOf(t).constructor) : o.apply(t, e));
}
function _isNativeReflectConstruct$a() {
  try {
    var t = !Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {
    }));
  } catch (t2) {
  }
  return (_isNativeReflectConstruct$a = function _isNativeReflectConstruct2() {
    return !!t;
  })();
}
var Collection = /* @__PURE__ */ function(_React$PureComponent) {
  function Collection2(props, context) {
    var _this;
    _classCallCheck(this, Collection2);
    _this = _callSuper$a(this, Collection2, [props, context]);
    _this._cellMetadata = [];
    _this._lastRenderedCellIndices = [];
    _this._cellCache = [];
    _this._isScrollingChange = _this._isScrollingChange.bind(_this);
    _this._setCollectionViewRef = _this._setCollectionViewRef.bind(_this);
    return _this;
  }
  _inherits(Collection2, _React$PureComponent);
  return _createClass(Collection2, [{
    key: "forceUpdate",
    value: function forceUpdate() {
      if (this._collectionView !== void 0) {
        this._collectionView.forceUpdate();
      }
    }
    /** See Collection#recomputeCellSizesAndPositions */
  }, {
    key: "recomputeCellSizesAndPositions",
    value: function recomputeCellSizesAndPositions() {
      this._cellCache = [];
      this._collectionView.recomputeCellSizesAndPositions();
    }
    /** React lifecycle methods */
  }, {
    key: "render",
    value: function render() {
      var props = _extends({}, (_objectDestructuringEmpty(this.props), this.props));
      return /* @__PURE__ */ reactExports.createElement(CollectionView, _extends({
        cellLayoutManager: this,
        isScrollingChange: this._isScrollingChange,
        ref: this._setCollectionViewRef
      }, props));
    }
    /** CellLayoutManager interface */
  }, {
    key: "calculateSizeAndPositionData",
    value: function calculateSizeAndPositionData$1() {
      var _this$props = this.props, cellCount = _this$props.cellCount, cellSizeAndPositionGetter = _this$props.cellSizeAndPositionGetter, sectionSize = _this$props.sectionSize;
      var data = calculateSizeAndPositionData({
        cellCount,
        cellSizeAndPositionGetter,
        sectionSize
      });
      this._cellMetadata = data.cellMetadata;
      this._sectionManager = data.sectionManager;
      this._height = data.height;
      this._width = data.width;
    }
    /**
     * Returns the most recently rendered set of cell indices.
     */
  }, {
    key: "getLastRenderedIndices",
    value: function getLastRenderedIndices() {
      return this._lastRenderedCellIndices;
    }
    /**
     * Calculates the minimum amount of change from the current scroll position to ensure the specified cell is (fully) visible.
     */
  }, {
    key: "getScrollPositionForCell",
    value: function getScrollPositionForCell(_ref) {
      var align = _ref.align, cellIndex = _ref.cellIndex, height = _ref.height, scrollLeft = _ref.scrollLeft, scrollTop = _ref.scrollTop, width = _ref.width;
      var cellCount = this.props.cellCount;
      if (cellIndex >= 0 && cellIndex < cellCount) {
        var cellMetadata = this._cellMetadata[cellIndex];
        scrollLeft = getUpdatedOffsetForIndex({
          align,
          cellOffset: cellMetadata.x,
          cellSize: cellMetadata.width,
          containerSize: width,
          currentOffset: scrollLeft
        });
        scrollTop = getUpdatedOffsetForIndex({
          align,
          cellOffset: cellMetadata.y,
          cellSize: cellMetadata.height,
          containerSize: height,
          currentOffset: scrollTop
        });
      }
      return {
        scrollLeft,
        scrollTop
      };
    }
  }, {
    key: "getTotalSize",
    value: function getTotalSize() {
      return {
        height: this._height,
        width: this._width
      };
    }
  }, {
    key: "cellRenderers",
    value: function cellRenderers(_ref2) {
      var _this2 = this;
      var height = _ref2.height, isScrolling = _ref2.isScrolling, width = _ref2.width, x = _ref2.x, y = _ref2.y;
      var _this$props2 = this.props, cellGroupRenderer = _this$props2.cellGroupRenderer, cellRenderer = _this$props2.cellRenderer;
      this._lastRenderedCellIndices = this._sectionManager.getCellIndices({
        height,
        width,
        x,
        y
      });
      return cellGroupRenderer({
        cellCache: this._cellCache,
        cellRenderer,
        cellSizeAndPositionGetter: function cellSizeAndPositionGetter(_ref3) {
          var index = _ref3.index;
          return _this2._sectionManager.getCellMetadata({
            index
          });
        },
        indices: this._lastRenderedCellIndices,
        isScrolling
      });
    }
  }, {
    key: "_isScrollingChange",
    value: function _isScrollingChange(isScrolling) {
      if (!isScrolling) {
        this._cellCache = [];
      }
    }
  }, {
    key: "_setCollectionViewRef",
    value: function _setCollectionViewRef(ref) {
      this._collectionView = ref;
    }
  }]);
}(reactExports.PureComponent);
_defineProperty(Collection, "defaultProps", {
  "aria-label": "grid",
  cellGroupRenderer: defaultCellGroupRenderer
});
Collection.propTypes = {};
function defaultCellGroupRenderer(_ref4) {
  var cellCache = _ref4.cellCache, cellRenderer = _ref4.cellRenderer, cellSizeAndPositionGetter = _ref4.cellSizeAndPositionGetter, indices = _ref4.indices, isScrolling = _ref4.isScrolling;
  return indices.map(function(index) {
    var cellMetadata = cellSizeAndPositionGetter({
      index
    });
    var cellRendererProps = {
      index,
      isScrolling,
      key: index,
      style: {
        height: cellMetadata.height,
        left: cellMetadata.x,
        position: "absolute",
        top: cellMetadata.y,
        width: cellMetadata.width
      }
    };
    if (isScrolling) {
      if (!(index in cellCache)) {
        cellCache[index] = cellRenderer(cellRendererProps);
      }
      return cellCache[index];
    } else {
      return cellRenderer(cellRendererProps);
    }
  }).filter(function(renderedCell) {
    return !!renderedCell;
  });
}
function _callSuper$9(t, o, e) {
  return o = _getPrototypeOf(o), _possibleConstructorReturn(t, _isNativeReflectConstruct$9() ? Reflect.construct(o, e || [], _getPrototypeOf(t).constructor) : o.apply(t, e));
}
function _isNativeReflectConstruct$9() {
  try {
    var t = !Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {
    }));
  } catch (t2) {
  }
  return (_isNativeReflectConstruct$9 = function _isNativeReflectConstruct2() {
    return !!t;
  })();
}
var ColumnSizer = /* @__PURE__ */ function(_React$PureComponent) {
  function ColumnSizer2(props, context) {
    var _this;
    _classCallCheck(this, ColumnSizer2);
    _this = _callSuper$9(this, ColumnSizer2, [props, context]);
    _this._registerChild = _this._registerChild.bind(_this);
    return _this;
  }
  _inherits(ColumnSizer2, _React$PureComponent);
  return _createClass(ColumnSizer2, [{
    key: "componentDidUpdate",
    value: function componentDidUpdate(prevProps) {
      var _this$props = this.props, columnMaxWidth = _this$props.columnMaxWidth, columnMinWidth = _this$props.columnMinWidth, columnCount = _this$props.columnCount, width = _this$props.width;
      if (columnMaxWidth !== prevProps.columnMaxWidth || columnMinWidth !== prevProps.columnMinWidth || columnCount !== prevProps.columnCount || width !== prevProps.width) {
        if (this._registeredChild) {
          this._registeredChild.recomputeGridSize();
        }
      }
    }
  }, {
    key: "render",
    value: function render() {
      var _this$props2 = this.props, children = _this$props2.children, columnMaxWidth = _this$props2.columnMaxWidth, columnMinWidth = _this$props2.columnMinWidth, columnCount = _this$props2.columnCount, width = _this$props2.width;
      var safeColumnMinWidth = columnMinWidth || 1;
      var safeColumnMaxWidth = columnMaxWidth ? Math.min(columnMaxWidth, width) : width;
      var columnWidth = width / columnCount;
      columnWidth = Math.max(safeColumnMinWidth, columnWidth);
      columnWidth = Math.min(safeColumnMaxWidth, columnWidth);
      columnWidth = Math.floor(columnWidth);
      var adjustedWidth = Math.min(width, columnWidth * columnCount);
      return children({
        adjustedWidth,
        columnWidth,
        getColumnWidth: function getColumnWidth() {
          return columnWidth;
        },
        registerChild: this._registerChild
      });
    }
  }, {
    key: "_registerChild",
    value: function _registerChild(child) {
      if (child && typeof child.recomputeGridSize !== "function") {
        throw Error("Unexpected child type registered; only Grid/MultiGrid children are supported.");
      }
      this._registeredChild = child;
      if (this._registeredChild) {
        this._registeredChild.recomputeGridSize();
      }
    }
  }]);
}(reactExports.PureComponent);
ColumnSizer.propTypes = {};
function calculateSizeAndPositionDataAndUpdateScrollOffset(_ref) {
  var cellCount = _ref.cellCount, cellSize = _ref.cellSize, computeMetadataCallback = _ref.computeMetadataCallback, computeMetadataCallbackProps = _ref.computeMetadataCallbackProps, nextCellsCount = _ref.nextCellsCount, nextCellSize = _ref.nextCellSize, nextScrollToIndex = _ref.nextScrollToIndex, scrollToIndex = _ref.scrollToIndex, updateScrollOffsetForScrollToIndex = _ref.updateScrollOffsetForScrollToIndex;
  if (cellCount !== nextCellsCount || (typeof cellSize === "number" || typeof nextCellSize === "number") && cellSize !== nextCellSize) {
    computeMetadataCallback(computeMetadataCallbackProps);
    if (scrollToIndex >= 0 && scrollToIndex === nextScrollToIndex) {
      updateScrollOffsetForScrollToIndex();
    }
  }
}
var CellSizeAndPositionManager = /* @__PURE__ */ function() {
  function CellSizeAndPositionManager2(_ref) {
    var cellCount = _ref.cellCount, cellSizeGetter = _ref.cellSizeGetter, estimatedCellSize = _ref.estimatedCellSize;
    _classCallCheck(this, CellSizeAndPositionManager2);
    _defineProperty(this, "_cellSizeAndPositionData", {});
    _defineProperty(this, "_lastMeasuredIndex", -1);
    _defineProperty(this, "_lastBatchedIndex", -1);
    _defineProperty(this, "_cellCount", void 0);
    _defineProperty(this, "_cellSizeGetter", void 0);
    _defineProperty(this, "_estimatedCellSize", void 0);
    this._cellSizeGetter = cellSizeGetter;
    this._cellCount = cellCount;
    this._estimatedCellSize = estimatedCellSize;
  }
  return _createClass(CellSizeAndPositionManager2, [{
    key: "areOffsetsAdjusted",
    value: function areOffsetsAdjusted() {
      return false;
    }
  }, {
    key: "configure",
    value: function configure(_ref2) {
      var cellCount = _ref2.cellCount, estimatedCellSize = _ref2.estimatedCellSize, cellSizeGetter = _ref2.cellSizeGetter;
      this._cellCount = cellCount;
      this._estimatedCellSize = estimatedCellSize;
      this._cellSizeGetter = cellSizeGetter;
    }
  }, {
    key: "getCellCount",
    value: function getCellCount() {
      return this._cellCount;
    }
  }, {
    key: "getEstimatedCellSize",
    value: function getEstimatedCellSize() {
      return this._estimatedCellSize;
    }
  }, {
    key: "getLastMeasuredIndex",
    value: function getLastMeasuredIndex() {
      return this._lastMeasuredIndex;
    }
  }, {
    key: "getOffsetAdjustment",
    value: function getOffsetAdjustment() {
      return 0;
    }
    /**
     * This method returns the size and position for the cell at the specified index.
     * It just-in-time calculates (or used cached values) for cells leading up to the index.
     */
  }, {
    key: "getSizeAndPositionOfCell",
    value: function getSizeAndPositionOfCell(index) {
      if (index < 0 || index >= this._cellCount) {
        throw Error("Requested index ".concat(index, " is outside of range 0..").concat(this._cellCount));
      }
      if (index > this._lastMeasuredIndex) {
        var lastMeasuredCellSizeAndPosition = this.getSizeAndPositionOfLastMeasuredCell();
        var offset = lastMeasuredCellSizeAndPosition.offset + lastMeasuredCellSizeAndPosition.size;
        for (var i = this._lastMeasuredIndex + 1; i <= index; i++) {
          var size = this._cellSizeGetter({
            index: i
          });
          if (size === void 0 || isNaN(size)) {
            throw Error("Invalid size returned for cell ".concat(i, " of value ").concat(size));
          } else if (size === null) {
            this._cellSizeAndPositionData[i] = {
              offset,
              size: 0
            };
            this._lastBatchedIndex = index;
          } else {
            this._cellSizeAndPositionData[i] = {
              offset,
              size
            };
            offset += size;
            this._lastMeasuredIndex = index;
          }
        }
      }
      return this._cellSizeAndPositionData[index];
    }
  }, {
    key: "getSizeAndPositionOfLastMeasuredCell",
    value: function getSizeAndPositionOfLastMeasuredCell() {
      return this._lastMeasuredIndex >= 0 ? this._cellSizeAndPositionData[this._lastMeasuredIndex] : {
        offset: 0,
        size: 0
      };
    }
    /**
     * Total size of all cells being measured.
     * This value will be completely estimated initially.
     * As cells are measured, the estimate will be updated.
     */
  }, {
    key: "getTotalSize",
    value: function getTotalSize() {
      var lastMeasuredCellSizeAndPosition = this.getSizeAndPositionOfLastMeasuredCell();
      var totalSizeOfMeasuredCells = lastMeasuredCellSizeAndPosition.offset + lastMeasuredCellSizeAndPosition.size;
      var numUnmeasuredCells = this._cellCount - this._lastMeasuredIndex - 1;
      var totalSizeOfUnmeasuredCells = numUnmeasuredCells * this._estimatedCellSize;
      return totalSizeOfMeasuredCells + totalSizeOfUnmeasuredCells;
    }
    /**
     * Determines a new offset that ensures a certain cell is visible, given the current offset.
     * If the cell is already visible then the current offset will be returned.
     * If the current offset is too great or small, it will be adjusted just enough to ensure the specified index is visible.
     *
     * @param align Desired alignment within container; one of "auto" (default), "start", or "end"
     * @param containerSize Size (width or height) of the container viewport
     * @param currentOffset Container's current (x or y) offset
     * @param totalSize Total size (width or height) of all cells
     * @return Offset to use to ensure the specified cell is visible
     */
  }, {
    key: "getUpdatedOffsetForIndex",
    value: function getUpdatedOffsetForIndex2(_ref3) {
      var _ref3$align = _ref3.align, align = _ref3$align === void 0 ? "auto" : _ref3$align, containerSize = _ref3.containerSize, currentOffset = _ref3.currentOffset, targetIndex = _ref3.targetIndex;
      if (containerSize <= 0) {
        return 0;
      }
      var datum = this.getSizeAndPositionOfCell(targetIndex);
      var maxOffset = datum.offset;
      var minOffset = maxOffset - containerSize + datum.size;
      var idealOffset;
      switch (align) {
        case "start":
          idealOffset = maxOffset;
          break;
        case "end":
          idealOffset = minOffset;
          break;
        case "center":
          idealOffset = maxOffset - (containerSize - datum.size) / 2;
          break;
        default:
          idealOffset = Math.max(minOffset, Math.min(maxOffset, currentOffset));
          break;
      }
      var totalSize = this.getTotalSize();
      return Math.max(0, Math.min(totalSize - containerSize, idealOffset));
    }
  }, {
    key: "getVisibleCellRange",
    value: function getVisibleCellRange(params) {
      var containerSize = params.containerSize, offset = params.offset;
      var totalSize = this.getTotalSize();
      if (totalSize === 0) {
        return {};
      }
      var maxOffset = offset + containerSize;
      var start = this._findNearestCell(offset);
      var datum = this.getSizeAndPositionOfCell(start);
      offset = datum.offset + datum.size;
      var stop = start;
      while (offset < maxOffset && stop < this._cellCount - 1) {
        stop++;
        offset += this.getSizeAndPositionOfCell(stop).size;
      }
      return {
        start,
        stop
      };
    }
    /**
     * Clear all cached values for cells after the specified index.
     * This method should be called for any cell that has changed its size.
     * It will not immediately perform any calculations; they'll be performed the next time getSizeAndPositionOfCell() is called.
     */
  }, {
    key: "resetCell",
    value: function resetCell(index) {
      this._lastMeasuredIndex = Math.min(this._lastMeasuredIndex, index - 1);
    }
  }, {
    key: "_binarySearch",
    value: function _binarySearch(high, low, offset) {
      while (low <= high) {
        var middle = low + Math.floor((high - low) / 2);
        var currentOffset = this.getSizeAndPositionOfCell(middle).offset;
        if (currentOffset === offset) {
          return middle;
        } else if (currentOffset < offset) {
          low = middle + 1;
        } else if (currentOffset > offset) {
          high = middle - 1;
        }
      }
      if (low > 0) {
        return low - 1;
      } else {
        return 0;
      }
    }
  }, {
    key: "_exponentialSearch",
    value: function _exponentialSearch(index, offset) {
      var interval = 1;
      while (index < this._cellCount && this.getSizeAndPositionOfCell(index).offset < offset) {
        index += interval;
        interval *= 2;
      }
      return this._binarySearch(Math.min(index, this._cellCount - 1), Math.floor(index / 2), offset);
    }
    /**
     * Searches for the cell (index) nearest the specified offset.
     *
     * If no exact match is found the next lowest cell index will be returned.
     * This allows partially visible cells (with offsets just before/above the fold) to be visible.
     */
  }, {
    key: "_findNearestCell",
    value: function _findNearestCell(offset) {
      if (isNaN(offset)) {
        throw Error("Invalid offset ".concat(offset, " specified"));
      }
      offset = Math.max(0, offset);
      var lastMeasuredCellSizeAndPosition = this.getSizeAndPositionOfLastMeasuredCell();
      var lastMeasuredIndex = Math.max(0, this._lastMeasuredIndex);
      if (lastMeasuredCellSizeAndPosition.offset >= offset) {
        return this._binarySearch(lastMeasuredIndex, 0, offset);
      } else {
        return this._exponentialSearch(lastMeasuredIndex, offset);
      }
    }
  }]);
}();
var DEFAULT_MAX_ELEMENT_SIZE = 15e5;
var CHROME_MAX_ELEMENT_SIZE = 16777100;
var isBrowser = function isBrowser2() {
  return typeof window !== "undefined";
};
var isChrome = function isChrome2() {
  return !!window.chrome;
};
var getMaxElementSize = function getMaxElementSize2() {
  if (isBrowser()) {
    if (isChrome()) {
      return CHROME_MAX_ELEMENT_SIZE;
    }
  }
  return DEFAULT_MAX_ELEMENT_SIZE;
};
var _excluded$1 = ["maxScrollSize"];
var ScalingCellSizeAndPositionManager = /* @__PURE__ */ function() {
  function ScalingCellSizeAndPositionManager2(_ref) {
    var _ref$maxScrollSize = _ref.maxScrollSize, maxScrollSize = _ref$maxScrollSize === void 0 ? getMaxElementSize() : _ref$maxScrollSize, params = _objectWithoutProperties(_ref, _excluded$1);
    _classCallCheck(this, ScalingCellSizeAndPositionManager2);
    _defineProperty(this, "_cellSizeAndPositionManager", void 0);
    _defineProperty(this, "_maxScrollSize", void 0);
    this._cellSizeAndPositionManager = new CellSizeAndPositionManager(params);
    this._maxScrollSize = maxScrollSize;
  }
  return _createClass(ScalingCellSizeAndPositionManager2, [{
    key: "areOffsetsAdjusted",
    value: function areOffsetsAdjusted() {
      return this._cellSizeAndPositionManager.getTotalSize() > this._maxScrollSize;
    }
  }, {
    key: "configure",
    value: function configure(params) {
      this._cellSizeAndPositionManager.configure(params);
    }
  }, {
    key: "getCellCount",
    value: function getCellCount() {
      return this._cellSizeAndPositionManager.getCellCount();
    }
  }, {
    key: "getEstimatedCellSize",
    value: function getEstimatedCellSize() {
      return this._cellSizeAndPositionManager.getEstimatedCellSize();
    }
  }, {
    key: "getLastMeasuredIndex",
    value: function getLastMeasuredIndex() {
      return this._cellSizeAndPositionManager.getLastMeasuredIndex();
    }
    /**
     * Number of pixels a cell at the given position (offset) should be shifted in order to fit within the scaled container.
     * The offset passed to this function is scaled (safe) as well.
     */
  }, {
    key: "getOffsetAdjustment",
    value: function getOffsetAdjustment(_ref2) {
      var containerSize = _ref2.containerSize, offset = _ref2.offset;
      var totalSize = this._cellSizeAndPositionManager.getTotalSize();
      var safeTotalSize = this.getTotalSize();
      var offsetPercentage = this._getOffsetPercentage({
        containerSize,
        offset,
        totalSize: safeTotalSize
      });
      return Math.round(offsetPercentage * (safeTotalSize - totalSize));
    }
  }, {
    key: "getSizeAndPositionOfCell",
    value: function getSizeAndPositionOfCell(index) {
      return this._cellSizeAndPositionManager.getSizeAndPositionOfCell(index);
    }
  }, {
    key: "getSizeAndPositionOfLastMeasuredCell",
    value: function getSizeAndPositionOfLastMeasuredCell() {
      return this._cellSizeAndPositionManager.getSizeAndPositionOfLastMeasuredCell();
    }
    /** See CellSizeAndPositionManager#getTotalSize */
  }, {
    key: "getTotalSize",
    value: function getTotalSize() {
      return Math.min(this._maxScrollSize, this._cellSizeAndPositionManager.getTotalSize());
    }
    /** See CellSizeAndPositionManager#getUpdatedOffsetForIndex */
  }, {
    key: "getUpdatedOffsetForIndex",
    value: function getUpdatedOffsetForIndex2(_ref3) {
      var _ref3$align = _ref3.align, align = _ref3$align === void 0 ? "auto" : _ref3$align, containerSize = _ref3.containerSize, currentOffset = _ref3.currentOffset, targetIndex = _ref3.targetIndex;
      currentOffset = this._safeOffsetToOffset({
        containerSize,
        offset: currentOffset
      });
      var offset = this._cellSizeAndPositionManager.getUpdatedOffsetForIndex({
        align,
        containerSize,
        currentOffset,
        targetIndex
      });
      return this._offsetToSafeOffset({
        containerSize,
        offset
      });
    }
    /** See CellSizeAndPositionManager#getVisibleCellRange */
  }, {
    key: "getVisibleCellRange",
    value: function getVisibleCellRange(_ref4) {
      var containerSize = _ref4.containerSize, offset = _ref4.offset;
      offset = this._safeOffsetToOffset({
        containerSize,
        offset
      });
      return this._cellSizeAndPositionManager.getVisibleCellRange({
        containerSize,
        offset
      });
    }
  }, {
    key: "resetCell",
    value: function resetCell(index) {
      this._cellSizeAndPositionManager.resetCell(index);
    }
  }, {
    key: "_getOffsetPercentage",
    value: function _getOffsetPercentage(_ref5) {
      var containerSize = _ref5.containerSize, offset = _ref5.offset, totalSize = _ref5.totalSize;
      return totalSize <= containerSize ? 0 : offset / (totalSize - containerSize);
    }
  }, {
    key: "_offsetToSafeOffset",
    value: function _offsetToSafeOffset(_ref6) {
      var containerSize = _ref6.containerSize, offset = _ref6.offset;
      var totalSize = this._cellSizeAndPositionManager.getTotalSize();
      var safeTotalSize = this.getTotalSize();
      if (totalSize === safeTotalSize) {
        return offset;
      } else {
        var offsetPercentage = this._getOffsetPercentage({
          containerSize,
          offset,
          totalSize
        });
        return Math.round(offsetPercentage * (safeTotalSize - containerSize));
      }
    }
  }, {
    key: "_safeOffsetToOffset",
    value: function _safeOffsetToOffset(_ref7) {
      var containerSize = _ref7.containerSize, offset = _ref7.offset;
      var totalSize = this._cellSizeAndPositionManager.getTotalSize();
      var safeTotalSize = this.getTotalSize();
      if (totalSize === safeTotalSize) {
        return offset;
      } else {
        var offsetPercentage = this._getOffsetPercentage({
          containerSize,
          offset,
          totalSize: safeTotalSize
        });
        return Math.round(offsetPercentage * (totalSize - containerSize));
      }
    }
  }]);
}();
var SCROLL_DIRECTION_BACKWARD = -1;
var SCROLL_DIRECTION_FORWARD$1 = 1;
function defaultOverscanIndicesGetter$1(_ref) {
  var cellCount = _ref.cellCount, overscanCellsCount = _ref.overscanCellsCount, scrollDirection = _ref.scrollDirection, startIndex = _ref.startIndex, stopIndex = _ref.stopIndex;
  if (scrollDirection === SCROLL_DIRECTION_FORWARD$1) {
    return {
      overscanStartIndex: Math.max(0, startIndex),
      overscanStopIndex: Math.min(cellCount - 1, stopIndex + overscanCellsCount)
    };
  } else {
    return {
      overscanStartIndex: Math.max(0, startIndex - overscanCellsCount),
      overscanStopIndex: Math.min(cellCount - 1, stopIndex)
    };
  }
}
function updateScrollIndexHelper(_ref) {
  var cellSize = _ref.cellSize, cellSizeAndPositionManager = _ref.cellSizeAndPositionManager, previousCellsCount = _ref.previousCellsCount, previousCellSize = _ref.previousCellSize, previousScrollToAlignment = _ref.previousScrollToAlignment, previousScrollToIndex = _ref.previousScrollToIndex, previousSize = _ref.previousSize, scrollOffset = _ref.scrollOffset, scrollToAlignment = _ref.scrollToAlignment, scrollToIndex = _ref.scrollToIndex, size = _ref.size, sizeJustIncreasedFromZero = _ref.sizeJustIncreasedFromZero, updateScrollIndexCallback = _ref.updateScrollIndexCallback;
  var cellCount = cellSizeAndPositionManager.getCellCount();
  var hasScrollToIndex = scrollToIndex >= 0 && scrollToIndex < cellCount;
  var sizeHasChanged = size !== previousSize || sizeJustIncreasedFromZero || !previousCellSize || typeof cellSize === "number" && cellSize !== previousCellSize;
  if (hasScrollToIndex && (sizeHasChanged || scrollToAlignment !== previousScrollToAlignment || scrollToIndex !== previousScrollToIndex)) {
    updateScrollIndexCallback(scrollToIndex);
  } else if (!hasScrollToIndex && cellCount > 0 && (size < previousSize || cellCount < previousCellsCount)) {
    if (scrollOffset > cellSizeAndPositionManager.getTotalSize() - size) {
      updateScrollIndexCallback(cellCount - 1);
    }
  }
}
function defaultCellRangeRenderer(_ref) {
  var cellCache = _ref.cellCache, cellRenderer = _ref.cellRenderer, columnSizeAndPositionManager = _ref.columnSizeAndPositionManager, columnStartIndex = _ref.columnStartIndex, columnStopIndex = _ref.columnStopIndex, deferredMeasurementCache = _ref.deferredMeasurementCache, horizontalOffsetAdjustment = _ref.horizontalOffsetAdjustment, isScrolling = _ref.isScrolling, isScrollingOptOut = _ref.isScrollingOptOut, parent = _ref.parent, rowSizeAndPositionManager = _ref.rowSizeAndPositionManager, rowStartIndex = _ref.rowStartIndex, rowStopIndex = _ref.rowStopIndex, styleCache = _ref.styleCache, verticalOffsetAdjustment = _ref.verticalOffsetAdjustment, visibleColumnIndices = _ref.visibleColumnIndices, visibleRowIndices = _ref.visibleRowIndices;
  var renderedCells = [];
  var areOffsetsAdjusted = columnSizeAndPositionManager.areOffsetsAdjusted() || rowSizeAndPositionManager.areOffsetsAdjusted();
  var canCacheStyle = !isScrolling && !areOffsetsAdjusted;
  for (var rowIndex = rowStartIndex; rowIndex <= rowStopIndex; rowIndex++) {
    var rowDatum = rowSizeAndPositionManager.getSizeAndPositionOfCell(rowIndex);
    for (var columnIndex = columnStartIndex; columnIndex <= columnStopIndex; columnIndex++) {
      var columnDatum = columnSizeAndPositionManager.getSizeAndPositionOfCell(columnIndex);
      var isVisible = columnIndex >= visibleColumnIndices.start && columnIndex <= visibleColumnIndices.stop && rowIndex >= visibleRowIndices.start && rowIndex <= visibleRowIndices.stop;
      var key = "".concat(rowIndex, "-").concat(columnIndex);
      var style = void 0;
      if (canCacheStyle && styleCache[key]) {
        style = styleCache[key];
      } else {
        if (deferredMeasurementCache && !deferredMeasurementCache.has(rowIndex, columnIndex)) {
          style = {
            height: "auto",
            left: 0,
            position: "absolute",
            top: 0,
            width: "auto"
          };
        } else {
          style = {
            height: rowDatum.size,
            left: columnDatum.offset + horizontalOffsetAdjustment,
            position: "absolute",
            top: rowDatum.offset + verticalOffsetAdjustment,
            width: columnDatum.size
          };
          styleCache[key] = style;
        }
      }
      var cellRendererParams = {
        columnIndex,
        isScrolling,
        isVisible,
        key,
        parent,
        rowIndex,
        style
      };
      var renderedCell = void 0;
      if ((isScrollingOptOut || isScrolling) && !horizontalOffsetAdjustment && !verticalOffsetAdjustment) {
        if (!cellCache[key]) {
          cellCache[key] = cellRenderer(cellRendererParams);
        }
        renderedCell = cellCache[key];
      } else {
        renderedCell = cellRenderer(cellRendererParams);
      }
      if (renderedCell == null || renderedCell === false) {
        continue;
      }
      if (!renderedCell.props.role) {
        renderedCell = /* @__PURE__ */ React.cloneElement(renderedCell, {
          role: "gridcell"
        });
      }
      renderedCells.push(renderedCell);
    }
  }
  return renderedCells;
}
var win;
if (typeof window !== "undefined") {
  win = window;
} else if (typeof self !== "undefined") {
  win = self;
} else {
  win = {};
}
var request = win.requestAnimationFrame || win.webkitRequestAnimationFrame || win.mozRequestAnimationFrame || win.oRequestAnimationFrame || win.msRequestAnimationFrame || function(callback) {
  return win.setTimeout(callback, 1e3 / 60);
};
var cancel = win.cancelAnimationFrame || win.webkitCancelAnimationFrame || win.mozCancelAnimationFrame || win.oCancelAnimationFrame || win.msCancelAnimationFrame || function(id) {
  win.clearTimeout(id);
};
var raf = request;
var caf = cancel;
var cancelAnimationTimeout = function cancelAnimationTimeout2(frame) {
  return caf(frame.id);
};
var requestAnimationTimeout = function requestAnimationTimeout2(callback, delay) {
  var start;
  Promise.resolve().then(function() {
    start = Date.now();
  });
  var _timeout = function timeout() {
    if (Date.now() - start >= delay) {
      callback.call();
    } else {
      frame.id = raf(_timeout);
    }
  };
  var frame = {
    id: raf(_timeout)
  };
  return frame;
};
function ownKeys$4(e, r2) {
  var t = Object.keys(e);
  if (Object.getOwnPropertySymbols) {
    var o = Object.getOwnPropertySymbols(e);
    r2 && (o = o.filter(function(r3) {
      return Object.getOwnPropertyDescriptor(e, r3).enumerable;
    })), t.push.apply(t, o);
  }
  return t;
}
function _objectSpread$4(e) {
  for (var r2 = 1; r2 < arguments.length; r2++) {
    var t = null != arguments[r2] ? arguments[r2] : {};
    r2 % 2 ? ownKeys$4(Object(t), true).forEach(function(r3) {
      _defineProperty(e, r3, t[r3]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys$4(Object(t)).forEach(function(r3) {
      Object.defineProperty(e, r3, Object.getOwnPropertyDescriptor(t, r3));
    });
  }
  return e;
}
function _callSuper$8(t, o, e) {
  return o = _getPrototypeOf(o), _possibleConstructorReturn(t, _isNativeReflectConstruct$8() ? Reflect.construct(o, e || [], _getPrototypeOf(t).constructor) : o.apply(t, e));
}
function _isNativeReflectConstruct$8() {
  try {
    var t = !Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {
    }));
  } catch (t2) {
  }
  return (_isNativeReflectConstruct$8 = function _isNativeReflectConstruct2() {
    return !!t;
  })();
}
var DEFAULT_SCROLLING_RESET_TIME_INTERVAL$1 = 150;
var SCROLL_POSITION_CHANGE_REASONS = {
  OBSERVED: "observed",
  REQUESTED: "requested"
};
var renderNull = function renderNull2() {
  return null;
};
var Grid = /* @__PURE__ */ function(_React$PureComponent) {
  function Grid2(props) {
    var _this;
    _classCallCheck(this, Grid2);
    _this = _callSuper$8(this, Grid2, [props]);
    _defineProperty(_this, "_onGridRenderedMemoizer", createCallbackMemoizer());
    _defineProperty(_this, "_onScrollMemoizer", createCallbackMemoizer(false));
    _defineProperty(_this, "_deferredInvalidateColumnIndex", null);
    _defineProperty(_this, "_deferredInvalidateRowIndex", null);
    _defineProperty(_this, "_recomputeScrollLeftFlag", false);
    _defineProperty(_this, "_recomputeScrollTopFlag", false);
    _defineProperty(_this, "_horizontalScrollBarSize", 0);
    _defineProperty(_this, "_verticalScrollBarSize", 0);
    _defineProperty(_this, "_scrollbarPresenceChanged", false);
    _defineProperty(_this, "_scrollingContainer", void 0);
    _defineProperty(_this, "_childrenToDisplay", void 0);
    _defineProperty(_this, "_columnStartIndex", void 0);
    _defineProperty(_this, "_columnStopIndex", void 0);
    _defineProperty(_this, "_rowStartIndex", void 0);
    _defineProperty(_this, "_rowStopIndex", void 0);
    _defineProperty(_this, "_renderedColumnStartIndex", 0);
    _defineProperty(_this, "_renderedColumnStopIndex", 0);
    _defineProperty(_this, "_renderedRowStartIndex", 0);
    _defineProperty(_this, "_renderedRowStopIndex", 0);
    _defineProperty(_this, "_initialScrollTop", void 0);
    _defineProperty(_this, "_initialScrollLeft", void 0);
    _defineProperty(_this, "_disablePointerEventsTimeoutId", void 0);
    _defineProperty(_this, "_styleCache", {});
    _defineProperty(_this, "_cellCache", {});
    _defineProperty(_this, "_debounceScrollEndedCallback", function() {
      _this._disablePointerEventsTimeoutId = null;
      _this.setState({
        isScrolling: false,
        needToResetStyleCache: false
      });
    });
    _defineProperty(_this, "_invokeOnGridRenderedHelper", function() {
      var onSectionRendered3 = _this.props.onSectionRendered;
      _this._onGridRenderedMemoizer({
        callback: onSectionRendered3,
        indices: {
          columnOverscanStartIndex: _this._columnStartIndex,
          columnOverscanStopIndex: _this._columnStopIndex,
          columnStartIndex: _this._renderedColumnStartIndex,
          columnStopIndex: _this._renderedColumnStopIndex,
          rowOverscanStartIndex: _this._rowStartIndex,
          rowOverscanStopIndex: _this._rowStopIndex,
          rowStartIndex: _this._renderedRowStartIndex,
          rowStopIndex: _this._renderedRowStopIndex
        }
      });
    });
    _defineProperty(_this, "_setScrollingContainerRef", function(ref) {
      _this._scrollingContainer = ref;
      if (typeof _this.props.elementRef === "function") {
        _this.props.elementRef(ref);
      } else if (_typeof(_this.props.elementRef) === "object") {
        _this.props.elementRef.current = ref;
      }
    });
    _defineProperty(_this, "_onScroll", function(event) {
      if (event.target === _this._scrollingContainer) {
        _this.handleScrollEvent(event.target);
      }
    });
    var columnSizeAndPositionManager = new ScalingCellSizeAndPositionManager({
      cellCount: props.columnCount,
      cellSizeGetter: function cellSizeGetter(params) {
        return Grid2._wrapSizeGetter(props.columnWidth)(params);
      },
      estimatedCellSize: Grid2._getEstimatedColumnSize(props)
    });
    var rowSizeAndPositionManager = new ScalingCellSizeAndPositionManager({
      cellCount: props.rowCount,
      cellSizeGetter: function cellSizeGetter(params) {
        return Grid2._wrapSizeGetter(props.rowHeight)(params);
      },
      estimatedCellSize: Grid2._getEstimatedRowSize(props)
    });
    _this.state = {
      instanceProps: {
        columnSizeAndPositionManager,
        rowSizeAndPositionManager,
        prevColumnWidth: props.columnWidth,
        prevRowHeight: props.rowHeight,
        prevColumnCount: props.columnCount,
        prevRowCount: props.rowCount,
        prevIsScrolling: props.isScrolling === true,
        prevScrollToColumn: props.scrollToColumn,
        prevScrollToRow: props.scrollToRow,
        scrollbarSize: 0,
        scrollbarSizeMeasured: false
      },
      isScrolling: false,
      scrollDirectionHorizontal: SCROLL_DIRECTION_FORWARD$1,
      scrollDirectionVertical: SCROLL_DIRECTION_FORWARD$1,
      scrollLeft: 0,
      scrollTop: 0,
      scrollPositionChangeReason: null,
      needToResetStyleCache: false
    };
    if (props.scrollToRow > 0) {
      _this._initialScrollTop = _this._getCalculatedScrollTop(props, _this.state);
    }
    if (props.scrollToColumn > 0) {
      _this._initialScrollLeft = _this._getCalculatedScrollLeft(props, _this.state);
    }
    return _this;
  }
  _inherits(Grid2, _React$PureComponent);
  return _createClass(Grid2, [{
    key: "getOffsetForCell",
    value: function getOffsetForCell() {
      var _ref = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {}, _ref$alignment = _ref.alignment, alignment = _ref$alignment === void 0 ? this.props.scrollToAlignment : _ref$alignment, _ref$columnIndex = _ref.columnIndex, columnIndex = _ref$columnIndex === void 0 ? this.props.scrollToColumn : _ref$columnIndex, _ref$rowIndex = _ref.rowIndex, rowIndex = _ref$rowIndex === void 0 ? this.props.scrollToRow : _ref$rowIndex;
      var offsetProps = _objectSpread$4(_objectSpread$4({}, this.props), {}, {
        scrollToAlignment: alignment,
        scrollToColumn: columnIndex,
        scrollToRow: rowIndex
      });
      return {
        scrollLeft: this._getCalculatedScrollLeft(offsetProps),
        scrollTop: this._getCalculatedScrollTop(offsetProps)
      };
    }
    /**
     * Gets estimated total rows' height.
     */
  }, {
    key: "getTotalRowsHeight",
    value: function getTotalRowsHeight() {
      return this.state.instanceProps.rowSizeAndPositionManager.getTotalSize();
    }
    /**
     * Gets estimated total columns' width.
     */
  }, {
    key: "getTotalColumnsWidth",
    value: function getTotalColumnsWidth() {
      return this.state.instanceProps.columnSizeAndPositionManager.getTotalSize();
    }
    /**
     * This method handles a scroll event originating from an external scroll control.
     * It's an advanced method and should probably not be used unless you're implementing a custom scroll-bar solution.
     */
  }, {
    key: "handleScrollEvent",
    value: function handleScrollEvent(_ref2) {
      var _ref2$scrollLeft = _ref2.scrollLeft, scrollLeftParam = _ref2$scrollLeft === void 0 ? 0 : _ref2$scrollLeft, _ref2$scrollTop = _ref2.scrollTop, scrollTopParam = _ref2$scrollTop === void 0 ? 0 : _ref2$scrollTop;
      if (scrollTopParam < 0) {
        return;
      }
      this._debounceScrollEnded();
      var _this$props = this.props, autoHeight = _this$props.autoHeight, autoWidth = _this$props.autoWidth, height = _this$props.height, width = _this$props.width;
      var instanceProps = this.state.instanceProps;
      var scrollbarSize2 = instanceProps.scrollbarSize;
      var totalRowsHeight = instanceProps.rowSizeAndPositionManager.getTotalSize();
      var totalColumnsWidth = instanceProps.columnSizeAndPositionManager.getTotalSize();
      var scrollLeft = Math.min(Math.max(0, totalColumnsWidth - width + scrollbarSize2), scrollLeftParam);
      var scrollTop = Math.min(Math.max(0, totalRowsHeight - height + scrollbarSize2), scrollTopParam);
      if (this.state.scrollLeft !== scrollLeft || this.state.scrollTop !== scrollTop) {
        var scrollDirectionHorizontal = scrollLeft !== this.state.scrollLeft ? scrollLeft > this.state.scrollLeft ? SCROLL_DIRECTION_FORWARD$1 : SCROLL_DIRECTION_BACKWARD : this.state.scrollDirectionHorizontal;
        var scrollDirectionVertical = scrollTop !== this.state.scrollTop ? scrollTop > this.state.scrollTop ? SCROLL_DIRECTION_FORWARD$1 : SCROLL_DIRECTION_BACKWARD : this.state.scrollDirectionVertical;
        var newState = {
          isScrolling: true,
          scrollDirectionHorizontal,
          scrollDirectionVertical,
          scrollPositionChangeReason: SCROLL_POSITION_CHANGE_REASONS.OBSERVED
        };
        if (!autoHeight) {
          newState.scrollTop = scrollTop;
        }
        if (!autoWidth) {
          newState.scrollLeft = scrollLeft;
        }
        newState.needToResetStyleCache = false;
        this.setState(newState);
      }
      this._invokeOnScrollMemoizer({
        scrollLeft,
        scrollTop,
        totalColumnsWidth,
        totalRowsHeight
      });
    }
    /**
     * Invalidate Grid size and recompute visible cells.
     * This is a deferred wrapper for recomputeGridSize().
     * It sets a flag to be evaluated on cDM/cDU to avoid unnecessary renders.
     * This method is intended for advanced use-cases like CellMeasurer.
     */
    // @TODO (bvaughn) Add automated test coverage for this.
  }, {
    key: "invalidateCellSizeAfterRender",
    value: function invalidateCellSizeAfterRender(_ref3) {
      var columnIndex = _ref3.columnIndex, rowIndex = _ref3.rowIndex;
      this._deferredInvalidateColumnIndex = typeof this._deferredInvalidateColumnIndex === "number" ? Math.min(this._deferredInvalidateColumnIndex, columnIndex) : columnIndex;
      this._deferredInvalidateRowIndex = typeof this._deferredInvalidateRowIndex === "number" ? Math.min(this._deferredInvalidateRowIndex, rowIndex) : rowIndex;
    }
    /**
     * Pre-measure all columns and rows in a Grid.
     * Typically cells are only measured as needed and estimated sizes are used for cells that have not yet been measured.
     * This method ensures that the next call to getTotalSize() returns an exact size (as opposed to just an estimated one).
     */
  }, {
    key: "measureAllCells",
    value: function measureAllCells() {
      var _this$props2 = this.props, columnCount = _this$props2.columnCount, rowCount = _this$props2.rowCount;
      var instanceProps = this.state.instanceProps;
      instanceProps.columnSizeAndPositionManager.getSizeAndPositionOfCell(columnCount - 1);
      instanceProps.rowSizeAndPositionManager.getSizeAndPositionOfCell(rowCount - 1);
    }
    /**
     * Forced recompute of row heights and column widths.
     * This function should be called if dynamic column or row sizes have changed but nothing else has.
     * Since Grid only receives :columnCount and :rowCount it has no way of detecting when the underlying data changes.
     */
  }, {
    key: "recomputeGridSize",
    value: function recomputeGridSize() {
      var _ref4 = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {}, _ref4$columnIndex = _ref4.columnIndex, columnIndex = _ref4$columnIndex === void 0 ? 0 : _ref4$columnIndex, _ref4$rowIndex = _ref4.rowIndex, rowIndex = _ref4$rowIndex === void 0 ? 0 : _ref4$rowIndex;
      var _this$props3 = this.props, scrollToColumn = _this$props3.scrollToColumn, scrollToRow = _this$props3.scrollToRow;
      var instanceProps = this.state.instanceProps;
      instanceProps.columnSizeAndPositionManager.resetCell(columnIndex);
      instanceProps.rowSizeAndPositionManager.resetCell(rowIndex);
      this._recomputeScrollLeftFlag = scrollToColumn >= 0 && (this.state.scrollDirectionHorizontal === SCROLL_DIRECTION_FORWARD$1 ? columnIndex <= scrollToColumn : columnIndex >= scrollToColumn);
      this._recomputeScrollTopFlag = scrollToRow >= 0 && (this.state.scrollDirectionVertical === SCROLL_DIRECTION_FORWARD$1 ? rowIndex <= scrollToRow : rowIndex >= scrollToRow);
      this._styleCache = {};
      this._cellCache = {};
      this.forceUpdate();
    }
    /**
     * Ensure column and row are visible.
     */
  }, {
    key: "scrollToCell",
    value: function scrollToCell(_ref5) {
      var columnIndex = _ref5.columnIndex, rowIndex = _ref5.rowIndex;
      var columnCount = this.props.columnCount;
      var props = this.props;
      if (columnCount > 1 && columnIndex !== void 0) {
        this._updateScrollLeftForScrollToColumn(_objectSpread$4(_objectSpread$4({}, props), {}, {
          scrollToColumn: columnIndex
        }));
      }
      if (rowIndex !== void 0) {
        this._updateScrollTopForScrollToRow(_objectSpread$4(_objectSpread$4({}, props), {}, {
          scrollToRow: rowIndex
        }));
      }
    }
  }, {
    key: "componentDidMount",
    value: function componentDidMount() {
      var _this$props4 = this.props, getScrollbarSize = _this$props4.getScrollbarSize, height = _this$props4.height, scrollLeft = _this$props4.scrollLeft, scrollToColumn = _this$props4.scrollToColumn, scrollTop = _this$props4.scrollTop, scrollToRow = _this$props4.scrollToRow, width = _this$props4.width;
      var instanceProps = this.state.instanceProps;
      this._initialScrollTop = 0;
      this._initialScrollLeft = 0;
      this._handleInvalidatedGridSize();
      if (!instanceProps.scrollbarSizeMeasured) {
        this.setState(function(prevState) {
          var stateUpdate2 = _objectSpread$4(_objectSpread$4({}, prevState), {}, {
            needToResetStyleCache: false
          });
          stateUpdate2.instanceProps.scrollbarSize = getScrollbarSize();
          stateUpdate2.instanceProps.scrollbarSizeMeasured = true;
          return stateUpdate2;
        });
      }
      if (typeof scrollLeft === "number" && scrollLeft >= 0 || typeof scrollTop === "number" && scrollTop >= 0) {
        var stateUpdate = Grid2._getScrollToPositionStateUpdate({
          prevState: this.state,
          scrollLeft,
          scrollTop
        });
        if (stateUpdate) {
          stateUpdate.needToResetStyleCache = false;
          this.setState(stateUpdate);
        }
      }
      if (this._scrollingContainer) {
        if (this._scrollingContainer.scrollLeft !== this.state.scrollLeft) {
          this._scrollingContainer.scrollLeft = this.state.scrollLeft;
        }
        if (this._scrollingContainer.scrollTop !== this.state.scrollTop) {
          this._scrollingContainer.scrollTop = this.state.scrollTop;
        }
      }
      var sizeIsBiggerThanZero = height > 0 && width > 0;
      if (scrollToColumn >= 0 && sizeIsBiggerThanZero) {
        this._updateScrollLeftForScrollToColumn();
      }
      if (scrollToRow >= 0 && sizeIsBiggerThanZero) {
        this._updateScrollTopForScrollToRow();
      }
      this._invokeOnGridRenderedHelper();
      this._invokeOnScrollMemoizer({
        scrollLeft: scrollLeft || 0,
        scrollTop: scrollTop || 0,
        totalColumnsWidth: instanceProps.columnSizeAndPositionManager.getTotalSize(),
        totalRowsHeight: instanceProps.rowSizeAndPositionManager.getTotalSize()
      });
      this._maybeCallOnScrollbarPresenceChange();
    }
    /**
     * @private
     * This method updates scrollLeft/scrollTop in state for the following conditions:
     * 1) New scroll-to-cell props have been set
     */
  }, {
    key: "componentDidUpdate",
    value: function componentDidUpdate(prevProps, prevState) {
      var _this2 = this;
      var _this$props5 = this.props, autoHeight = _this$props5.autoHeight, autoWidth = _this$props5.autoWidth, columnCount = _this$props5.columnCount, height = _this$props5.height, rowCount = _this$props5.rowCount, scrollToAlignment = _this$props5.scrollToAlignment, scrollToColumn = _this$props5.scrollToColumn, scrollToRow = _this$props5.scrollToRow, width = _this$props5.width;
      var _this$state = this.state, scrollLeft = _this$state.scrollLeft, scrollPositionChangeReason = _this$state.scrollPositionChangeReason, scrollTop = _this$state.scrollTop, instanceProps = _this$state.instanceProps;
      this._handleInvalidatedGridSize();
      var columnOrRowCountJustIncreasedFromZero = columnCount > 0 && prevProps.columnCount === 0 || rowCount > 0 && prevProps.rowCount === 0;
      if (scrollPositionChangeReason === SCROLL_POSITION_CHANGE_REASONS.REQUESTED) {
        if (!autoWidth && scrollLeft >= 0 && (scrollLeft !== this._scrollingContainer.scrollLeft || columnOrRowCountJustIncreasedFromZero)) {
          this._scrollingContainer.scrollLeft = scrollLeft;
        }
        if (!autoHeight && scrollTop >= 0 && (scrollTop !== this._scrollingContainer.scrollTop || columnOrRowCountJustIncreasedFromZero)) {
          this._scrollingContainer.scrollTop = scrollTop;
        }
      }
      var sizeJustIncreasedFromZero = (prevProps.width === 0 || prevProps.height === 0) && height > 0 && width > 0;
      if (this._recomputeScrollLeftFlag) {
        this._recomputeScrollLeftFlag = false;
        this._updateScrollLeftForScrollToColumn(this.props);
      } else {
        updateScrollIndexHelper({
          cellSizeAndPositionManager: instanceProps.columnSizeAndPositionManager,
          previousCellsCount: prevProps.columnCount,
          previousCellSize: prevProps.columnWidth,
          previousScrollToAlignment: prevProps.scrollToAlignment,
          previousScrollToIndex: prevProps.scrollToColumn,
          previousSize: prevProps.width,
          scrollOffset: scrollLeft,
          scrollToAlignment,
          scrollToIndex: scrollToColumn,
          size: width,
          sizeJustIncreasedFromZero,
          updateScrollIndexCallback: function updateScrollIndexCallback() {
            return _this2._updateScrollLeftForScrollToColumn(_this2.props);
          }
        });
      }
      if (this._recomputeScrollTopFlag) {
        this._recomputeScrollTopFlag = false;
        this._updateScrollTopForScrollToRow(this.props);
      } else {
        updateScrollIndexHelper({
          cellSizeAndPositionManager: instanceProps.rowSizeAndPositionManager,
          previousCellsCount: prevProps.rowCount,
          previousCellSize: prevProps.rowHeight,
          previousScrollToAlignment: prevProps.scrollToAlignment,
          previousScrollToIndex: prevProps.scrollToRow,
          previousSize: prevProps.height,
          scrollOffset: scrollTop,
          scrollToAlignment,
          scrollToIndex: scrollToRow,
          size: height,
          sizeJustIncreasedFromZero,
          updateScrollIndexCallback: function updateScrollIndexCallback() {
            return _this2._updateScrollTopForScrollToRow(_this2.props);
          }
        });
      }
      this._invokeOnGridRenderedHelper();
      if (scrollLeft !== prevState.scrollLeft || scrollTop !== prevState.scrollTop) {
        var totalRowsHeight = instanceProps.rowSizeAndPositionManager.getTotalSize();
        var totalColumnsWidth = instanceProps.columnSizeAndPositionManager.getTotalSize();
        this._invokeOnScrollMemoizer({
          scrollLeft,
          scrollTop,
          totalColumnsWidth,
          totalRowsHeight
        });
      }
      this._maybeCallOnScrollbarPresenceChange();
    }
  }, {
    key: "componentWillUnmount",
    value: function componentWillUnmount() {
      if (this._disablePointerEventsTimeoutId) {
        cancelAnimationTimeout(this._disablePointerEventsTimeoutId);
      }
    }
    /**
     * This method updates scrollLeft/scrollTop in state for the following conditions:
     * 1) Empty content (0 rows or columns)
     * 2) New scroll props overriding the current state
     * 3) Cells-count or cells-size has changed, making previous scroll offsets invalid
     */
  }, {
    key: "render",
    value: function render() {
      var _this$props6 = this.props, autoContainerWidth = _this$props6.autoContainerWidth, autoHeight = _this$props6.autoHeight, autoWidth = _this$props6.autoWidth, className = _this$props6.className, containerProps = _this$props6.containerProps, containerRole = _this$props6.containerRole, containerStyle = _this$props6.containerStyle, height = _this$props6.height, id = _this$props6.id, noContentRenderer2 = _this$props6.noContentRenderer, role = _this$props6.role, style = _this$props6.style, tabIndex = _this$props6.tabIndex, width = _this$props6.width;
      var _this$state2 = this.state, instanceProps = _this$state2.instanceProps, needToResetStyleCache = _this$state2.needToResetStyleCache;
      var isScrolling = this._isScrolling();
      var gridStyle = {
        boxSizing: "border-box",
        direction: "ltr",
        height: autoHeight ? "auto" : height,
        position: "relative",
        width: autoWidth ? "auto" : width,
        WebkitOverflowScrolling: "touch",
        willChange: "transform"
      };
      if (needToResetStyleCache) {
        this._styleCache = {};
      }
      if (!this.state.isScrolling) {
        this._resetStyleCache();
      }
      this._calculateChildrenToRender(this.props, this.state);
      var totalColumnsWidth = instanceProps.columnSizeAndPositionManager.getTotalSize();
      var totalRowsHeight = instanceProps.rowSizeAndPositionManager.getTotalSize();
      var verticalScrollBarSize = totalRowsHeight > height ? instanceProps.scrollbarSize : 0;
      var horizontalScrollBarSize = totalColumnsWidth > width ? instanceProps.scrollbarSize : 0;
      if (horizontalScrollBarSize !== this._horizontalScrollBarSize || verticalScrollBarSize !== this._verticalScrollBarSize) {
        this._horizontalScrollBarSize = horizontalScrollBarSize;
        this._verticalScrollBarSize = verticalScrollBarSize;
        this._scrollbarPresenceChanged = true;
      }
      gridStyle.overflowX = totalColumnsWidth + verticalScrollBarSize <= width ? "hidden" : "auto";
      gridStyle.overflowY = totalRowsHeight + horizontalScrollBarSize <= height ? "hidden" : "auto";
      var childrenToDisplay = this._childrenToDisplay;
      var showNoContentRenderer = childrenToDisplay.length === 0 && height > 0 && width > 0;
      return /* @__PURE__ */ reactExports.createElement("div", _extends({
        ref: this._setScrollingContainerRef
      }, containerProps, {
        "aria-label": this.props["aria-label"],
        "aria-readonly": this.props["aria-readonly"],
        className: clsx("ReactVirtualized__Grid", className),
        id,
        onScroll: this._onScroll,
        role,
        style: _objectSpread$4(_objectSpread$4({}, gridStyle), style),
        tabIndex
      }), childrenToDisplay.length > 0 && /* @__PURE__ */ reactExports.createElement("div", {
        className: "ReactVirtualized__Grid__innerScrollContainer",
        role: containerRole,
        style: _objectSpread$4({
          width: autoContainerWidth ? "auto" : totalColumnsWidth,
          height: totalRowsHeight,
          maxWidth: totalColumnsWidth,
          maxHeight: totalRowsHeight,
          overflow: "hidden",
          pointerEvents: isScrolling ? "none" : "",
          position: "relative"
        }, containerStyle)
      }, childrenToDisplay), showNoContentRenderer && noContentRenderer2());
    }
    /* ---------------------------- Helper methods ---------------------------- */
  }, {
    key: "_calculateChildrenToRender",
    value: function _calculateChildrenToRender() {
      var props = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : this.props;
      var state = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : this.state;
      var cellRenderer = props.cellRenderer, cellRangeRenderer = props.cellRangeRenderer, columnCount = props.columnCount, deferredMeasurementCache = props.deferredMeasurementCache, height = props.height, overscanColumnCount = props.overscanColumnCount, overscanIndicesGetter = props.overscanIndicesGetter, overscanRowCount = props.overscanRowCount, rowCount = props.rowCount, width = props.width, isScrollingOptOut = props.isScrollingOptOut;
      var scrollDirectionHorizontal = state.scrollDirectionHorizontal, scrollDirectionVertical = state.scrollDirectionVertical, instanceProps = state.instanceProps;
      var scrollTop = this._initialScrollTop > 0 ? this._initialScrollTop : state.scrollTop;
      var scrollLeft = this._initialScrollLeft > 0 ? this._initialScrollLeft : state.scrollLeft;
      var isScrolling = this._isScrolling(props, state);
      this._childrenToDisplay = [];
      if (height > 0 && width > 0) {
        var visibleColumnIndices = instanceProps.columnSizeAndPositionManager.getVisibleCellRange({
          containerSize: width,
          offset: scrollLeft
        });
        var visibleRowIndices = instanceProps.rowSizeAndPositionManager.getVisibleCellRange({
          containerSize: height,
          offset: scrollTop
        });
        var horizontalOffsetAdjustment = instanceProps.columnSizeAndPositionManager.getOffsetAdjustment({
          containerSize: width,
          offset: scrollLeft
        });
        var verticalOffsetAdjustment = instanceProps.rowSizeAndPositionManager.getOffsetAdjustment({
          containerSize: height,
          offset: scrollTop
        });
        this._renderedColumnStartIndex = visibleColumnIndices.start;
        this._renderedColumnStopIndex = visibleColumnIndices.stop;
        this._renderedRowStartIndex = visibleRowIndices.start;
        this._renderedRowStopIndex = visibleRowIndices.stop;
        var overscanColumnIndices = overscanIndicesGetter({
          direction: "horizontal",
          cellCount: columnCount,
          overscanCellsCount: overscanColumnCount,
          scrollDirection: scrollDirectionHorizontal,
          startIndex: typeof visibleColumnIndices.start === "number" ? visibleColumnIndices.start : 0,
          stopIndex: typeof visibleColumnIndices.stop === "number" ? visibleColumnIndices.stop : -1
        });
        var overscanRowIndices = overscanIndicesGetter({
          direction: "vertical",
          cellCount: rowCount,
          overscanCellsCount: overscanRowCount,
          scrollDirection: scrollDirectionVertical,
          startIndex: typeof visibleRowIndices.start === "number" ? visibleRowIndices.start : 0,
          stopIndex: typeof visibleRowIndices.stop === "number" ? visibleRowIndices.stop : -1
        });
        var columnStartIndex = overscanColumnIndices.overscanStartIndex;
        var columnStopIndex = overscanColumnIndices.overscanStopIndex;
        var rowStartIndex = overscanRowIndices.overscanStartIndex;
        var rowStopIndex = overscanRowIndices.overscanStopIndex;
        if (deferredMeasurementCache) {
          if (!deferredMeasurementCache.hasFixedHeight()) {
            for (var rowIndex = rowStartIndex; rowIndex <= rowStopIndex; rowIndex++) {
              if (!deferredMeasurementCache.has(rowIndex, 0)) {
                columnStartIndex = 0;
                columnStopIndex = columnCount - 1;
                break;
              }
            }
          }
          if (!deferredMeasurementCache.hasFixedWidth()) {
            for (var columnIndex = columnStartIndex; columnIndex <= columnStopIndex; columnIndex++) {
              if (!deferredMeasurementCache.has(0, columnIndex)) {
                rowStartIndex = 0;
                rowStopIndex = rowCount - 1;
                break;
              }
            }
          }
        }
        this._childrenToDisplay = cellRangeRenderer({
          cellCache: this._cellCache,
          cellRenderer,
          columnSizeAndPositionManager: instanceProps.columnSizeAndPositionManager,
          columnStartIndex,
          columnStopIndex,
          deferredMeasurementCache,
          horizontalOffsetAdjustment,
          isScrolling,
          isScrollingOptOut,
          parent: this,
          rowSizeAndPositionManager: instanceProps.rowSizeAndPositionManager,
          rowStartIndex,
          rowStopIndex,
          scrollLeft,
          scrollTop,
          styleCache: this._styleCache,
          verticalOffsetAdjustment,
          visibleColumnIndices,
          visibleRowIndices
        });
        this._columnStartIndex = columnStartIndex;
        this._columnStopIndex = columnStopIndex;
        this._rowStartIndex = rowStartIndex;
        this._rowStopIndex = rowStopIndex;
      }
    }
    /**
     * Sets an :isScrolling flag for a small window of time.
     * This flag is used to disable pointer events on the scrollable portion of the Grid.
     * This prevents jerky/stuttery mouse-wheel scrolling.
     */
  }, {
    key: "_debounceScrollEnded",
    value: function _debounceScrollEnded() {
      var scrollingResetTimeInterval = this.props.scrollingResetTimeInterval;
      if (this._disablePointerEventsTimeoutId) {
        cancelAnimationTimeout(this._disablePointerEventsTimeoutId);
      }
      this._disablePointerEventsTimeoutId = requestAnimationTimeout(this._debounceScrollEndedCallback, scrollingResetTimeInterval);
    }
  }, {
    key: "_handleInvalidatedGridSize",
    value: (
      /**
       * Check for batched CellMeasurer size invalidations.
       * This will occur the first time one or more previously unmeasured cells are rendered.
       */
      function _handleInvalidatedGridSize() {
        if (typeof this._deferredInvalidateColumnIndex === "number" && typeof this._deferredInvalidateRowIndex === "number") {
          var columnIndex = this._deferredInvalidateColumnIndex;
          var rowIndex = this._deferredInvalidateRowIndex;
          this._deferredInvalidateColumnIndex = null;
          this._deferredInvalidateRowIndex = null;
          this.recomputeGridSize({
            columnIndex,
            rowIndex
          });
        }
      }
    )
  }, {
    key: "_invokeOnScrollMemoizer",
    value: function _invokeOnScrollMemoizer(_ref6) {
      var _this3 = this;
      var scrollLeft = _ref6.scrollLeft, scrollTop = _ref6.scrollTop, totalColumnsWidth = _ref6.totalColumnsWidth, totalRowsHeight = _ref6.totalRowsHeight;
      this._onScrollMemoizer({
        callback: function callback(_ref7) {
          var scrollLeft2 = _ref7.scrollLeft, scrollTop2 = _ref7.scrollTop;
          var _this3$props = _this3.props, height = _this3$props.height, onScroll6 = _this3$props.onScroll, width = _this3$props.width;
          onScroll6({
            clientHeight: height,
            clientWidth: width,
            scrollHeight: totalRowsHeight,
            scrollLeft: scrollLeft2,
            scrollTop: scrollTop2,
            scrollWidth: totalColumnsWidth
          });
        },
        indices: {
          scrollLeft,
          scrollTop
        }
      });
    }
  }, {
    key: "_isScrolling",
    value: function _isScrolling() {
      var props = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : this.props;
      var state = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : this.state;
      return Object.hasOwnProperty.call(props, "isScrolling") ? Boolean(props.isScrolling) : Boolean(state.isScrolling);
    }
  }, {
    key: "_maybeCallOnScrollbarPresenceChange",
    value: function _maybeCallOnScrollbarPresenceChange() {
      if (this._scrollbarPresenceChanged) {
        var onScrollbarPresenceChange2 = this.props.onScrollbarPresenceChange;
        this._scrollbarPresenceChanged = false;
        onScrollbarPresenceChange2({
          horizontal: this._horizontalScrollBarSize > 0,
          size: this.state.instanceProps.scrollbarSize,
          vertical: this._verticalScrollBarSize > 0
        });
      }
    }
  }, {
    key: "scrollToPosition",
    value: (
      /**
       * Scroll to the specified offset(s).
       * Useful for animating position changes.
       */
      function scrollToPosition(_ref8) {
        var scrollLeft = _ref8.scrollLeft, scrollTop = _ref8.scrollTop;
        var stateUpdate = Grid2._getScrollToPositionStateUpdate({
          prevState: this.state,
          scrollLeft,
          scrollTop
        });
        if (stateUpdate) {
          stateUpdate.needToResetStyleCache = false;
          this.setState(stateUpdate);
        }
      }
    )
  }, {
    key: "_getCalculatedScrollLeft",
    value: function _getCalculatedScrollLeft() {
      var props = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : this.props;
      var state = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : this.state;
      return Grid2._getCalculatedScrollLeft(props, state);
    }
  }, {
    key: "_updateScrollLeftForScrollToColumn",
    value: function _updateScrollLeftForScrollToColumn() {
      var props = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : this.props;
      var state = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : this.state;
      var stateUpdate = Grid2._getScrollLeftForScrollToColumnStateUpdate(props, state);
      if (stateUpdate) {
        stateUpdate.needToResetStyleCache = false;
        this.setState(stateUpdate);
      }
    }
  }, {
    key: "_getCalculatedScrollTop",
    value: function _getCalculatedScrollTop() {
      var props = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : this.props;
      var state = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : this.state;
      return Grid2._getCalculatedScrollTop(props, state);
    }
  }, {
    key: "_resetStyleCache",
    value: function _resetStyleCache() {
      var styleCache = this._styleCache;
      var cellCache = this._cellCache;
      var isScrollingOptOut = this.props.isScrollingOptOut;
      this._cellCache = {};
      this._styleCache = {};
      for (var rowIndex = this._rowStartIndex; rowIndex <= this._rowStopIndex; rowIndex++) {
        for (var columnIndex = this._columnStartIndex; columnIndex <= this._columnStopIndex; columnIndex++) {
          var key = "".concat(rowIndex, "-").concat(columnIndex);
          this._styleCache[key] = styleCache[key];
          if (isScrollingOptOut) {
            this._cellCache[key] = cellCache[key];
          }
        }
      }
    }
  }, {
    key: "_updateScrollTopForScrollToRow",
    value: function _updateScrollTopForScrollToRow() {
      var props = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : this.props;
      var state = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : this.state;
      var stateUpdate = Grid2._getScrollTopForScrollToRowStateUpdate(props, state);
      if (stateUpdate) {
        stateUpdate.needToResetStyleCache = false;
        this.setState(stateUpdate);
      }
    }
  }], [{
    key: "getDerivedStateFromProps",
    value: function getDerivedStateFromProps(nextProps, prevState) {
      var newState = {};
      if (nextProps.columnCount === 0 && prevState.scrollLeft !== 0 || nextProps.rowCount === 0 && prevState.scrollTop !== 0) {
        newState.scrollLeft = 0;
        newState.scrollTop = 0;
      } else if (nextProps.scrollLeft !== prevState.scrollLeft && nextProps.scrollToColumn < 0 || nextProps.scrollTop !== prevState.scrollTop && nextProps.scrollToRow < 0) {
        Object.assign(newState, Grid2._getScrollToPositionStateUpdate({
          prevState,
          scrollLeft: nextProps.scrollLeft,
          scrollTop: nextProps.scrollTop
        }));
      }
      var instanceProps = prevState.instanceProps;
      newState.needToResetStyleCache = false;
      if (nextProps.columnWidth !== instanceProps.prevColumnWidth || nextProps.rowHeight !== instanceProps.prevRowHeight) {
        newState.needToResetStyleCache = true;
      }
      instanceProps.columnSizeAndPositionManager.configure({
        cellCount: nextProps.columnCount,
        estimatedCellSize: Grid2._getEstimatedColumnSize(nextProps),
        cellSizeGetter: Grid2._wrapSizeGetter(nextProps.columnWidth)
      });
      instanceProps.rowSizeAndPositionManager.configure({
        cellCount: nextProps.rowCount,
        estimatedCellSize: Grid2._getEstimatedRowSize(nextProps),
        cellSizeGetter: Grid2._wrapSizeGetter(nextProps.rowHeight)
      });
      if (instanceProps.prevColumnCount === 0 || instanceProps.prevRowCount === 0) {
        instanceProps.prevColumnCount = 0;
        instanceProps.prevRowCount = 0;
      }
      if (nextProps.autoHeight && nextProps.isScrolling === false && instanceProps.prevIsScrolling === true) {
        Object.assign(newState, {
          isScrolling: false
        });
      }
      var maybeStateA;
      var maybeStateB;
      calculateSizeAndPositionDataAndUpdateScrollOffset({
        cellCount: instanceProps.prevColumnCount,
        cellSize: typeof instanceProps.prevColumnWidth === "number" ? instanceProps.prevColumnWidth : null,
        computeMetadataCallback: function computeMetadataCallback() {
          return instanceProps.columnSizeAndPositionManager.resetCell(0);
        },
        computeMetadataCallbackProps: nextProps,
        nextCellsCount: nextProps.columnCount,
        nextCellSize: typeof nextProps.columnWidth === "number" ? nextProps.columnWidth : null,
        nextScrollToIndex: nextProps.scrollToColumn,
        scrollToIndex: instanceProps.prevScrollToColumn,
        updateScrollOffsetForScrollToIndex: function updateScrollOffsetForScrollToIndex() {
          maybeStateA = Grid2._getScrollLeftForScrollToColumnStateUpdate(nextProps, prevState);
        }
      });
      calculateSizeAndPositionDataAndUpdateScrollOffset({
        cellCount: instanceProps.prevRowCount,
        cellSize: typeof instanceProps.prevRowHeight === "number" ? instanceProps.prevRowHeight : null,
        computeMetadataCallback: function computeMetadataCallback() {
          return instanceProps.rowSizeAndPositionManager.resetCell(0);
        },
        computeMetadataCallbackProps: nextProps,
        nextCellsCount: nextProps.rowCount,
        nextCellSize: typeof nextProps.rowHeight === "number" ? nextProps.rowHeight : null,
        nextScrollToIndex: nextProps.scrollToRow,
        scrollToIndex: instanceProps.prevScrollToRow,
        updateScrollOffsetForScrollToIndex: function updateScrollOffsetForScrollToIndex() {
          maybeStateB = Grid2._getScrollTopForScrollToRowStateUpdate(nextProps, prevState);
        }
      });
      instanceProps.prevColumnCount = nextProps.columnCount;
      instanceProps.prevColumnWidth = nextProps.columnWidth;
      instanceProps.prevIsScrolling = nextProps.isScrolling === true;
      instanceProps.prevRowCount = nextProps.rowCount;
      instanceProps.prevRowHeight = nextProps.rowHeight;
      instanceProps.prevScrollToColumn = nextProps.scrollToColumn;
      instanceProps.prevScrollToRow = nextProps.scrollToRow;
      instanceProps.scrollbarSize = nextProps.getScrollbarSize();
      if (instanceProps.scrollbarSize === void 0) {
        instanceProps.scrollbarSizeMeasured = false;
        instanceProps.scrollbarSize = 0;
      } else {
        instanceProps.scrollbarSizeMeasured = true;
      }
      newState.instanceProps = instanceProps;
      return _objectSpread$4(_objectSpread$4(_objectSpread$4({}, newState), maybeStateA), maybeStateB);
    }
  }, {
    key: "_getEstimatedColumnSize",
    value: function _getEstimatedColumnSize(props) {
      return typeof props.columnWidth === "number" ? props.columnWidth : props.estimatedColumnSize;
    }
  }, {
    key: "_getEstimatedRowSize",
    value: function _getEstimatedRowSize(props) {
      return typeof props.rowHeight === "number" ? props.rowHeight : props.estimatedRowSize;
    }
  }, {
    key: "_getScrollToPositionStateUpdate",
    value: (
      /**
       * Get the updated state after scrolling to
       * scrollLeft and scrollTop
       */
      function _getScrollToPositionStateUpdate(_ref9) {
        var prevState = _ref9.prevState, scrollLeft = _ref9.scrollLeft, scrollTop = _ref9.scrollTop;
        var newState = {
          scrollPositionChangeReason: SCROLL_POSITION_CHANGE_REASONS.REQUESTED
        };
        if (typeof scrollLeft === "number" && scrollLeft >= 0) {
          newState.scrollDirectionHorizontal = scrollLeft > prevState.scrollLeft ? SCROLL_DIRECTION_FORWARD$1 : SCROLL_DIRECTION_BACKWARD;
          newState.scrollLeft = scrollLeft;
        }
        if (typeof scrollTop === "number" && scrollTop >= 0) {
          newState.scrollDirectionVertical = scrollTop > prevState.scrollTop ? SCROLL_DIRECTION_FORWARD$1 : SCROLL_DIRECTION_BACKWARD;
          newState.scrollTop = scrollTop;
        }
        if (typeof scrollLeft === "number" && scrollLeft >= 0 && scrollLeft !== prevState.scrollLeft || typeof scrollTop === "number" && scrollTop >= 0 && scrollTop !== prevState.scrollTop) {
          return newState;
        }
        return {};
      }
    )
  }, {
    key: "_wrapSizeGetter",
    value: function _wrapSizeGetter(value) {
      return typeof value === "function" ? value : function() {
        return value;
      };
    }
  }, {
    key: "_getCalculatedScrollLeft",
    value: function _getCalculatedScrollLeft(nextProps, prevState) {
      var columnCount = nextProps.columnCount, height = nextProps.height, scrollToAlignment = nextProps.scrollToAlignment, scrollToColumn = nextProps.scrollToColumn, width = nextProps.width;
      var scrollLeft = prevState.scrollLeft, instanceProps = prevState.instanceProps;
      if (columnCount > 0) {
        var finalColumn = columnCount - 1;
        var targetIndex = scrollToColumn < 0 ? finalColumn : Math.min(finalColumn, scrollToColumn);
        var totalRowsHeight = instanceProps.rowSizeAndPositionManager.getTotalSize();
        var scrollBarSize = instanceProps.scrollbarSizeMeasured && totalRowsHeight > height ? instanceProps.scrollbarSize : 0;
        return instanceProps.columnSizeAndPositionManager.getUpdatedOffsetForIndex({
          align: scrollToAlignment,
          containerSize: width - scrollBarSize,
          currentOffset: scrollLeft,
          targetIndex
        });
      }
      return 0;
    }
  }, {
    key: "_getScrollLeftForScrollToColumnStateUpdate",
    value: function _getScrollLeftForScrollToColumnStateUpdate(nextProps, prevState) {
      var scrollLeft = prevState.scrollLeft;
      var calculatedScrollLeft = Grid2._getCalculatedScrollLeft(nextProps, prevState);
      if (typeof calculatedScrollLeft === "number" && calculatedScrollLeft >= 0 && scrollLeft !== calculatedScrollLeft) {
        return Grid2._getScrollToPositionStateUpdate({
          prevState,
          scrollLeft: calculatedScrollLeft,
          scrollTop: -1
        });
      }
      return {};
    }
  }, {
    key: "_getCalculatedScrollTop",
    value: function _getCalculatedScrollTop(nextProps, prevState) {
      var height = nextProps.height, rowCount = nextProps.rowCount, scrollToAlignment = nextProps.scrollToAlignment, scrollToRow = nextProps.scrollToRow, width = nextProps.width;
      var scrollTop = prevState.scrollTop, instanceProps = prevState.instanceProps;
      if (rowCount > 0) {
        var finalRow = rowCount - 1;
        var targetIndex = scrollToRow < 0 ? finalRow : Math.min(finalRow, scrollToRow);
        var totalColumnsWidth = instanceProps.columnSizeAndPositionManager.getTotalSize();
        var scrollBarSize = instanceProps.scrollbarSizeMeasured && totalColumnsWidth > width ? instanceProps.scrollbarSize : 0;
        return instanceProps.rowSizeAndPositionManager.getUpdatedOffsetForIndex({
          align: scrollToAlignment,
          containerSize: height - scrollBarSize,
          currentOffset: scrollTop,
          targetIndex
        });
      }
      return 0;
    }
  }, {
    key: "_getScrollTopForScrollToRowStateUpdate",
    value: function _getScrollTopForScrollToRowStateUpdate(nextProps, prevState) {
      var scrollTop = prevState.scrollTop;
      var calculatedScrollTop = Grid2._getCalculatedScrollTop(nextProps, prevState);
      if (typeof calculatedScrollTop === "number" && calculatedScrollTop >= 0 && scrollTop !== calculatedScrollTop) {
        return Grid2._getScrollToPositionStateUpdate({
          prevState,
          scrollLeft: -1,
          scrollTop: calculatedScrollTop
        });
      }
      return {};
    }
  }]);
}(reactExports.PureComponent);
_defineProperty(Grid, "defaultProps", {
  "aria-label": "grid",
  "aria-readonly": true,
  autoContainerWidth: false,
  autoHeight: false,
  autoWidth: false,
  cellRangeRenderer: defaultCellRangeRenderer,
  containerRole: "row",
  containerStyle: {},
  estimatedColumnSize: 100,
  estimatedRowSize: 30,
  getScrollbarSize: scrollbarSize,
  noContentRenderer: renderNull,
  onScroll: function onScroll2() {
  },
  onScrollbarPresenceChange: function onScrollbarPresenceChange() {
  },
  onSectionRendered: function onSectionRendered2() {
  },
  overscanColumnCount: 0,
  overscanIndicesGetter: defaultOverscanIndicesGetter$1,
  overscanRowCount: 10,
  role: "grid",
  scrollingResetTimeInterval: DEFAULT_SCROLLING_RESET_TIME_INTERVAL$1,
  scrollToAlignment: "auto",
  scrollToColumn: -1,
  scrollToRow: -1,
  style: {},
  tabIndex: 0,
  isScrollingOptOut: false
});
polyfill(Grid);
var SCROLL_DIRECTION_FORWARD = 1;
function defaultOverscanIndicesGetter(_ref) {
  var cellCount = _ref.cellCount, overscanCellsCount = _ref.overscanCellsCount, scrollDirection = _ref.scrollDirection, startIndex = _ref.startIndex, stopIndex = _ref.stopIndex;
  overscanCellsCount = Math.max(1, overscanCellsCount);
  if (scrollDirection === SCROLL_DIRECTION_FORWARD) {
    return {
      overscanStartIndex: Math.max(0, startIndex - 1),
      overscanStopIndex: Math.min(cellCount - 1, stopIndex + overscanCellsCount)
    };
  } else {
    return {
      overscanStartIndex: Math.max(0, startIndex - overscanCellsCount),
      overscanStopIndex: Math.min(cellCount - 1, stopIndex + 1)
    };
  }
}
function _callSuper$7(t, o, e) {
  return o = _getPrototypeOf(o), _possibleConstructorReturn(t, _isNativeReflectConstruct$7() ? Reflect.construct(o, e || [], _getPrototypeOf(t).constructor) : o.apply(t, e));
}
function _isNativeReflectConstruct$7() {
  try {
    var t = !Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {
    }));
  } catch (t2) {
  }
  return (_isNativeReflectConstruct$7 = function _isNativeReflectConstruct2() {
    return !!t;
  })();
}
var InfiniteLoader = /* @__PURE__ */ function(_React$PureComponent) {
  function InfiniteLoader2(props, context) {
    var _this;
    _classCallCheck(this, InfiniteLoader2);
    _this = _callSuper$7(this, InfiniteLoader2, [props, context]);
    _this._loadMoreRowsMemoizer = createCallbackMemoizer();
    _this._onRowsRendered = _this._onRowsRendered.bind(_this);
    _this._registerChild = _this._registerChild.bind(_this);
    return _this;
  }
  _inherits(InfiniteLoader2, _React$PureComponent);
  return _createClass(InfiniteLoader2, [{
    key: "resetLoadMoreRowsCache",
    value: function resetLoadMoreRowsCache(autoReload) {
      this._loadMoreRowsMemoizer = createCallbackMemoizer();
      if (autoReload) {
        this._doStuff(this._lastRenderedStartIndex, this._lastRenderedStopIndex);
      }
    }
  }, {
    key: "render",
    value: function render() {
      var children = this.props.children;
      return children({
        onRowsRendered: this._onRowsRendered,
        registerChild: this._registerChild
      });
    }
  }, {
    key: "_loadUnloadedRanges",
    value: function _loadUnloadedRanges(unloadedRanges) {
      var _this2 = this;
      var loadMoreRows = this.props.loadMoreRows;
      unloadedRanges.forEach(function(unloadedRange) {
        var promise = loadMoreRows(unloadedRange);
        if (promise) {
          promise.then(function() {
            if (isRangeVisible({
              lastRenderedStartIndex: _this2._lastRenderedStartIndex,
              lastRenderedStopIndex: _this2._lastRenderedStopIndex,
              startIndex: unloadedRange.startIndex,
              stopIndex: unloadedRange.stopIndex
            })) {
              if (_this2._registeredChild) {
                forceUpdateReactVirtualizedComponent(_this2._registeredChild, _this2._lastRenderedStartIndex);
              }
            }
          });
        }
      });
    }
  }, {
    key: "_onRowsRendered",
    value: function _onRowsRendered(_ref) {
      var startIndex = _ref.startIndex, stopIndex = _ref.stopIndex;
      this._lastRenderedStartIndex = startIndex;
      this._lastRenderedStopIndex = stopIndex;
      this._doStuff(startIndex, stopIndex);
    }
  }, {
    key: "_doStuff",
    value: function _doStuff(startIndex, stopIndex) {
      var _ref2, _this3 = this;
      var _this$props = this.props, isRowLoaded = _this$props.isRowLoaded, minimumBatchSize = _this$props.minimumBatchSize, rowCount = _this$props.rowCount, threshold = _this$props.threshold;
      var unloadedRanges = scanForUnloadedRanges({
        isRowLoaded,
        minimumBatchSize,
        rowCount,
        startIndex: Math.max(0, startIndex - threshold),
        stopIndex: Math.min(rowCount - 1, stopIndex + threshold)
      });
      var squashedUnloadedRanges = (_ref2 = []).concat.apply(_ref2, _toConsumableArray(unloadedRanges.map(function(_ref3) {
        var startIndex2 = _ref3.startIndex, stopIndex2 = _ref3.stopIndex;
        return [startIndex2, stopIndex2];
      })));
      this._loadMoreRowsMemoizer({
        callback: function callback() {
          _this3._loadUnloadedRanges(unloadedRanges);
        },
        indices: {
          squashedUnloadedRanges
        }
      });
    }
  }, {
    key: "_registerChild",
    value: function _registerChild(registeredChild) {
      this._registeredChild = registeredChild;
    }
  }]);
}(reactExports.PureComponent);
_defineProperty(InfiniteLoader, "defaultProps", {
  minimumBatchSize: 10,
  rowCount: 0,
  threshold: 15
});
InfiniteLoader.propTypes = {};
function isRangeVisible(_ref4) {
  var lastRenderedStartIndex = _ref4.lastRenderedStartIndex, lastRenderedStopIndex = _ref4.lastRenderedStopIndex, startIndex = _ref4.startIndex, stopIndex = _ref4.stopIndex;
  return !(startIndex > lastRenderedStopIndex || stopIndex < lastRenderedStartIndex);
}
function scanForUnloadedRanges(_ref5) {
  var isRowLoaded = _ref5.isRowLoaded, minimumBatchSize = _ref5.minimumBatchSize, rowCount = _ref5.rowCount, startIndex = _ref5.startIndex, stopIndex = _ref5.stopIndex;
  var unloadedRanges = [];
  var rangeStartIndex = null;
  var rangeStopIndex = null;
  for (var index = startIndex; index <= stopIndex; index++) {
    var loaded = isRowLoaded({
      index
    });
    if (!loaded) {
      rangeStopIndex = index;
      if (rangeStartIndex === null) {
        rangeStartIndex = index;
      }
    } else if (rangeStopIndex !== null) {
      unloadedRanges.push({
        startIndex: rangeStartIndex,
        stopIndex: rangeStopIndex
      });
      rangeStartIndex = rangeStopIndex = null;
    }
  }
  if (rangeStopIndex !== null) {
    var potentialStopIndex = Math.min(Math.max(rangeStopIndex, rangeStartIndex + minimumBatchSize - 1), rowCount - 1);
    for (var _index = rangeStopIndex + 1; _index <= potentialStopIndex; _index++) {
      if (!isRowLoaded({
        index: _index
      })) {
        rangeStopIndex = _index;
      } else {
        break;
      }
    }
    unloadedRanges.push({
      startIndex: rangeStartIndex,
      stopIndex: rangeStopIndex
    });
  }
  if (unloadedRanges.length) {
    var firstUnloadedRange = unloadedRanges[0];
    while (firstUnloadedRange.stopIndex - firstUnloadedRange.startIndex + 1 < minimumBatchSize && firstUnloadedRange.startIndex > 0) {
      var _index2 = firstUnloadedRange.startIndex - 1;
      if (!isRowLoaded({
        index: _index2
      })) {
        firstUnloadedRange.startIndex = _index2;
      } else {
        break;
      }
    }
  }
  return unloadedRanges;
}
function forceUpdateReactVirtualizedComponent(component) {
  var currentIndex = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : 0;
  var recomputeSize = typeof component.recomputeGridSize === "function" ? component.recomputeGridSize : component.recomputeRowHeights;
  if (recomputeSize) {
    recomputeSize.call(component, currentIndex);
  } else {
    component.forceUpdate();
  }
}
function _callSuper$6(t, o, e) {
  return o = _getPrototypeOf(o), _possibleConstructorReturn(t, _isNativeReflectConstruct$6() ? Reflect.construct(o, e || [], _getPrototypeOf(t).constructor) : o.apply(t, e));
}
function _isNativeReflectConstruct$6() {
  try {
    var t = !Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {
    }));
  } catch (t2) {
  }
  return (_isNativeReflectConstruct$6 = function _isNativeReflectConstruct2() {
    return !!t;
  })();
}
var List = /* @__PURE__ */ function(_React$PureComponent) {
  function List2() {
    var _this;
    _classCallCheck(this, List2);
    for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }
    _this = _callSuper$6(this, List2, [].concat(args));
    _defineProperty(_this, "Grid", void 0);
    _defineProperty(_this, "_cellRenderer", function(_ref) {
      var parent = _ref.parent, rowIndex = _ref.rowIndex, style = _ref.style, isScrolling = _ref.isScrolling, isVisible = _ref.isVisible, key = _ref.key;
      var rowRenderer = _this.props.rowRenderer;
      var widthDescriptor = Object.getOwnPropertyDescriptor(style, "width");
      if (widthDescriptor && widthDescriptor.writable) {
        style.width = "100%";
      }
      return rowRenderer({
        index: rowIndex,
        style,
        isScrolling,
        isVisible,
        key,
        parent
      });
    });
    _defineProperty(_this, "_setRef", function(ref) {
      _this.Grid = ref;
    });
    _defineProperty(_this, "_onScroll", function(_ref2) {
      var clientHeight = _ref2.clientHeight, scrollHeight = _ref2.scrollHeight, scrollTop = _ref2.scrollTop;
      var onScroll6 = _this.props.onScroll;
      onScroll6({
        clientHeight,
        scrollHeight,
        scrollTop
      });
    });
    _defineProperty(_this, "_onSectionRendered", function(_ref3) {
      var rowOverscanStartIndex = _ref3.rowOverscanStartIndex, rowOverscanStopIndex = _ref3.rowOverscanStopIndex, rowStartIndex = _ref3.rowStartIndex, rowStopIndex = _ref3.rowStopIndex;
      var onRowsRendered3 = _this.props.onRowsRendered;
      onRowsRendered3({
        overscanStartIndex: rowOverscanStartIndex,
        overscanStopIndex: rowOverscanStopIndex,
        startIndex: rowStartIndex,
        stopIndex: rowStopIndex
      });
    });
    return _this;
  }
  _inherits(List2, _React$PureComponent);
  return _createClass(List2, [{
    key: "forceUpdateGrid",
    value: function forceUpdateGrid() {
      if (this.Grid) {
        this.Grid.forceUpdate();
      }
    }
    /** See Grid#getOffsetForCell */
  }, {
    key: "getOffsetForRow",
    value: function getOffsetForRow(_ref4) {
      var alignment = _ref4.alignment, index = _ref4.index;
      if (this.Grid) {
        var _this$Grid$getOffsetF = this.Grid.getOffsetForCell({
          alignment,
          rowIndex: index,
          columnIndex: 0
        }), scrollTop = _this$Grid$getOffsetF.scrollTop;
        return scrollTop;
      }
      return 0;
    }
    /** CellMeasurer compatibility */
  }, {
    key: "invalidateCellSizeAfterRender",
    value: function invalidateCellSizeAfterRender(_ref5) {
      var columnIndex = _ref5.columnIndex, rowIndex = _ref5.rowIndex;
      if (this.Grid) {
        this.Grid.invalidateCellSizeAfterRender({
          rowIndex,
          columnIndex
        });
      }
    }
    /** See Grid#measureAllCells */
  }, {
    key: "measureAllRows",
    value: function measureAllRows() {
      if (this.Grid) {
        this.Grid.measureAllCells();
      }
    }
    /** CellMeasurer compatibility */
  }, {
    key: "recomputeGridSize",
    value: function recomputeGridSize() {
      var _ref6 = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {}, _ref6$columnIndex = _ref6.columnIndex, columnIndex = _ref6$columnIndex === void 0 ? 0 : _ref6$columnIndex, _ref6$rowIndex = _ref6.rowIndex, rowIndex = _ref6$rowIndex === void 0 ? 0 : _ref6$rowIndex;
      if (this.Grid) {
        this.Grid.recomputeGridSize({
          rowIndex,
          columnIndex
        });
      }
    }
    /** See Grid#recomputeGridSize */
  }, {
    key: "recomputeRowHeights",
    value: function recomputeRowHeights() {
      var index = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : 0;
      if (this.Grid) {
        this.Grid.recomputeGridSize({
          rowIndex: index,
          columnIndex: 0
        });
      }
    }
    /** See Grid#scrollToPosition */
  }, {
    key: "scrollToPosition",
    value: function scrollToPosition() {
      var scrollTop = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : 0;
      if (this.Grid) {
        this.Grid.scrollToPosition({
          scrollTop
        });
      }
    }
    /** See Grid#scrollToCell */
  }, {
    key: "scrollToRow",
    value: function scrollToRow() {
      var index = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : 0;
      if (this.Grid) {
        this.Grid.scrollToCell({
          columnIndex: 0,
          rowIndex: index
        });
      }
    }
  }, {
    key: "render",
    value: function render() {
      var _this$props = this.props, className = _this$props.className, noRowsRenderer3 = _this$props.noRowsRenderer, scrollToIndex = _this$props.scrollToIndex, width = _this$props.width;
      var classNames = clsx("ReactVirtualized__List", className);
      return /* @__PURE__ */ reactExports.createElement(Grid, _extends({}, this.props, {
        autoContainerWidth: true,
        cellRenderer: this._cellRenderer,
        className: classNames,
        columnWidth: width,
        columnCount: 1,
        noContentRenderer: noRowsRenderer3,
        onScroll: this._onScroll,
        onSectionRendered: this._onSectionRendered,
        ref: this._setRef,
        scrollToRow: scrollToIndex
      }));
    }
  }]);
}(reactExports.PureComponent);
_defineProperty(List, "defaultProps", {
  autoHeight: false,
  estimatedRowSize: 30,
  onScroll: function onScroll3() {
  },
  noRowsRenderer: function noRowsRenderer() {
    return null;
  },
  onRowsRendered: function onRowsRendered() {
  },
  overscanIndicesGetter: defaultOverscanIndicesGetter,
  overscanRowCount: 10,
  scrollToAlignment: "auto",
  scrollToIndex: -1,
  style: {}
});
function _GEA(a, l, h, y) {
  var i = h + 1;
  while (l <= h) {
    var m = l + h >>> 1, x = a[m];
    if (x >= y) {
      i = m;
      h = m - 1;
    } else {
      l = m + 1;
    }
  }
  return i;
}
function _GEP(a, l, h, y, c) {
  var i = h + 1;
  while (l <= h) {
    var m = l + h >>> 1, x = a[m];
    if (c(x, y) >= 0) {
      i = m;
      h = m - 1;
    } else {
      l = m + 1;
    }
  }
  return i;
}
function dispatchBsearchGE(a, y, c, l, h) {
  if (typeof c === "function") {
    return _GEP(a, l === void 0 ? 0 : l | 0, h === void 0 ? a.length - 1 : h | 0, y, c);
  } else {
    return _GEA(a, c === void 0 ? 0 : c | 0, l === void 0 ? a.length - 1 : l | 0, y);
  }
}
function _GTA(a, l, h, y) {
  var i = h + 1;
  while (l <= h) {
    var m = l + h >>> 1, x = a[m];
    if (x > y) {
      i = m;
      h = m - 1;
    } else {
      l = m + 1;
    }
  }
  return i;
}
function _GTP(a, l, h, y, c) {
  var i = h + 1;
  while (l <= h) {
    var m = l + h >>> 1, x = a[m];
    if (c(x, y) > 0) {
      i = m;
      h = m - 1;
    } else {
      l = m + 1;
    }
  }
  return i;
}
function dispatchBsearchGT(a, y, c, l, h) {
  if (typeof c === "function") {
    return _GTP(a, l === void 0 ? 0 : l | 0, h === void 0 ? a.length - 1 : h | 0, y, c);
  } else {
    return _GTA(a, c === void 0 ? 0 : c | 0, l === void 0 ? a.length - 1 : l | 0, y);
  }
}
function _LTA(a, l, h, y) {
  var i = l - 1;
  while (l <= h) {
    var m = l + h >>> 1, x = a[m];
    if (x < y) {
      i = m;
      l = m + 1;
    } else {
      h = m - 1;
    }
  }
  return i;
}
function _LTP(a, l, h, y, c) {
  var i = l - 1;
  while (l <= h) {
    var m = l + h >>> 1, x = a[m];
    if (c(x, y) < 0) {
      i = m;
      l = m + 1;
    } else {
      h = m - 1;
    }
  }
  return i;
}
function dispatchBsearchLT(a, y, c, l, h) {
  if (typeof c === "function") {
    return _LTP(a, l === void 0 ? 0 : l | 0, h === void 0 ? a.length - 1 : h | 0, y, c);
  } else {
    return _LTA(a, c === void 0 ? 0 : c | 0, l === void 0 ? a.length - 1 : l | 0, y);
  }
}
function _LEA(a, l, h, y) {
  var i = l - 1;
  while (l <= h) {
    var m = l + h >>> 1, x = a[m];
    if (x <= y) {
      i = m;
      l = m + 1;
    } else {
      h = m - 1;
    }
  }
  return i;
}
function _LEP(a, l, h, y, c) {
  var i = l - 1;
  while (l <= h) {
    var m = l + h >>> 1, x = a[m];
    if (c(x, y) <= 0) {
      i = m;
      l = m + 1;
    } else {
      h = m - 1;
    }
  }
  return i;
}
function dispatchBsearchLE(a, y, c, l, h) {
  if (typeof c === "function") {
    return _LEP(a, l === void 0 ? 0 : l | 0, h === void 0 ? a.length - 1 : h | 0, y, c);
  } else {
    return _LEA(a, c === void 0 ? 0 : c | 0, l === void 0 ? a.length - 1 : l | 0, y);
  }
}
function _EQA(a, l, h, y) {
  while (l <= h) {
    var m = l + h >>> 1, x = a[m];
    if (x === y) {
      return m;
    } else if (x <= y) {
      l = m + 1;
    } else {
      h = m - 1;
    }
  }
  return -1;
}
function _EQP(a, l, h, y, c) {
  while (l <= h) {
    var m = l + h >>> 1, x = a[m];
    var p = c(x, y);
    if (p === 0) {
      return m;
    } else if (p <= 0) {
      l = m + 1;
    } else {
      h = m - 1;
    }
  }
  return -1;
}
function dispatchBsearchEQ(a, y, c, l, h) {
  if (typeof c === "function") {
    return _EQP(a, l === void 0 ? 0 : l | 0, h === void 0 ? a.length - 1 : h | 0, y, c);
  } else {
    return _EQA(a, c === void 0 ? 0 : c | 0, l === void 0 ? a.length - 1 : l | 0, y);
  }
}
const bounds = {
  ge: dispatchBsearchGE,
  gt: dispatchBsearchGT,
  lt: dispatchBsearchLT,
  le: dispatchBsearchLE,
  eq: dispatchBsearchEQ
};
var NOT_FOUND = 0;
var SUCCESS = 1;
var EMPTY = 2;
function IntervalTreeNode(mid, left, right, leftPoints, rightPoints) {
  this.mid = mid;
  this.left = left;
  this.right = right;
  this.leftPoints = leftPoints;
  this.rightPoints = rightPoints;
  this.count = (left ? left.count : 0) + (right ? right.count : 0) + leftPoints.length;
}
var proto = IntervalTreeNode.prototype;
function copy(a, b) {
  a.mid = b.mid;
  a.left = b.left;
  a.right = b.right;
  a.leftPoints = b.leftPoints;
  a.rightPoints = b.rightPoints;
  a.count = b.count;
}
function rebuild(node, intervals) {
  var ntree = createIntervalTree(intervals);
  node.mid = ntree.mid;
  node.left = ntree.left;
  node.right = ntree.right;
  node.leftPoints = ntree.leftPoints;
  node.rightPoints = ntree.rightPoints;
  node.count = ntree.count;
}
function rebuildWithInterval(node, interval) {
  var intervals = node.intervals([]);
  intervals.push(interval);
  rebuild(node, intervals);
}
function rebuildWithoutInterval(node, interval) {
  var intervals = node.intervals([]);
  var idx = intervals.indexOf(interval);
  if (idx < 0) {
    return NOT_FOUND;
  }
  intervals.splice(idx, 1);
  rebuild(node, intervals);
  return SUCCESS;
}
proto.intervals = function(result) {
  result.push.apply(result, this.leftPoints);
  if (this.left) {
    this.left.intervals(result);
  }
  if (this.right) {
    this.right.intervals(result);
  }
  return result;
};
proto.insert = function(interval) {
  var weight = this.count - this.leftPoints.length;
  this.count += 1;
  if (interval[1] < this.mid) {
    if (this.left) {
      if (4 * (this.left.count + 1) > 3 * (weight + 1)) {
        rebuildWithInterval(this, interval);
      } else {
        this.left.insert(interval);
      }
    } else {
      this.left = createIntervalTree([interval]);
    }
  } else if (interval[0] > this.mid) {
    if (this.right) {
      if (4 * (this.right.count + 1) > 3 * (weight + 1)) {
        rebuildWithInterval(this, interval);
      } else {
        this.right.insert(interval);
      }
    } else {
      this.right = createIntervalTree([interval]);
    }
  } else {
    var l = bounds.ge(this.leftPoints, interval, compareBegin);
    var r2 = bounds.ge(this.rightPoints, interval, compareEnd);
    this.leftPoints.splice(l, 0, interval);
    this.rightPoints.splice(r2, 0, interval);
  }
};
proto.remove = function(interval) {
  var weight = this.count - this.leftPoints;
  if (interval[1] < this.mid) {
    if (!this.left) {
      return NOT_FOUND;
    }
    var rw = this.right ? this.right.count : 0;
    if (4 * rw > 3 * (weight - 1)) {
      return rebuildWithoutInterval(this, interval);
    }
    var r2 = this.left.remove(interval);
    if (r2 === EMPTY) {
      this.left = null;
      this.count -= 1;
      return SUCCESS;
    } else if (r2 === SUCCESS) {
      this.count -= 1;
    }
    return r2;
  } else if (interval[0] > this.mid) {
    if (!this.right) {
      return NOT_FOUND;
    }
    var lw = this.left ? this.left.count : 0;
    if (4 * lw > 3 * (weight - 1)) {
      return rebuildWithoutInterval(this, interval);
    }
    var r2 = this.right.remove(interval);
    if (r2 === EMPTY) {
      this.right = null;
      this.count -= 1;
      return SUCCESS;
    } else if (r2 === SUCCESS) {
      this.count -= 1;
    }
    return r2;
  } else {
    if (this.count === 1) {
      if (this.leftPoints[0] === interval) {
        return EMPTY;
      } else {
        return NOT_FOUND;
      }
    }
    if (this.leftPoints.length === 1 && this.leftPoints[0] === interval) {
      if (this.left && this.right) {
        var p = this;
        var n = this.left;
        while (n.right) {
          p = n;
          n = n.right;
        }
        if (p === this) {
          n.right = this.right;
        } else {
          var l = this.left;
          var r2 = this.right;
          p.count -= n.count;
          p.right = n.left;
          n.left = l;
          n.right = r2;
        }
        copy(this, n);
        this.count = (this.left ? this.left.count : 0) + (this.right ? this.right.count : 0) + this.leftPoints.length;
      } else if (this.left) {
        copy(this, this.left);
      } else {
        copy(this, this.right);
      }
      return SUCCESS;
    }
    for (var l = bounds.ge(this.leftPoints, interval, compareBegin); l < this.leftPoints.length; ++l) {
      if (this.leftPoints[l][0] !== interval[0]) {
        break;
      }
      if (this.leftPoints[l] === interval) {
        this.count -= 1;
        this.leftPoints.splice(l, 1);
        for (var r2 = bounds.ge(this.rightPoints, interval, compareEnd); r2 < this.rightPoints.length; ++r2) {
          if (this.rightPoints[r2][1] !== interval[1]) {
            break;
          } else if (this.rightPoints[r2] === interval) {
            this.rightPoints.splice(r2, 1);
            return SUCCESS;
          }
        }
      }
    }
    return NOT_FOUND;
  }
};
function reportLeftRange(arr, hi, cb) {
  for (var i = 0; i < arr.length && arr[i][0] <= hi; ++i) {
    var r2 = cb(arr[i]);
    if (r2) {
      return r2;
    }
  }
}
function reportRightRange(arr, lo, cb) {
  for (var i = arr.length - 1; i >= 0 && arr[i][1] >= lo; --i) {
    var r2 = cb(arr[i]);
    if (r2) {
      return r2;
    }
  }
}
function reportRange(arr, cb) {
  for (var i = 0; i < arr.length; ++i) {
    var r2 = cb(arr[i]);
    if (r2) {
      return r2;
    }
  }
}
proto.queryPoint = function(x, cb) {
  if (x < this.mid) {
    if (this.left) {
      var r2 = this.left.queryPoint(x, cb);
      if (r2) {
        return r2;
      }
    }
    return reportLeftRange(this.leftPoints, x, cb);
  } else if (x > this.mid) {
    if (this.right) {
      var r2 = this.right.queryPoint(x, cb);
      if (r2) {
        return r2;
      }
    }
    return reportRightRange(this.rightPoints, x, cb);
  } else {
    return reportRange(this.leftPoints, cb);
  }
};
proto.queryInterval = function(lo, hi, cb) {
  if (lo < this.mid && this.left) {
    var r2 = this.left.queryInterval(lo, hi, cb);
    if (r2) {
      return r2;
    }
  }
  if (hi > this.mid && this.right) {
    var r2 = this.right.queryInterval(lo, hi, cb);
    if (r2) {
      return r2;
    }
  }
  if (hi < this.mid) {
    return reportLeftRange(this.leftPoints, hi, cb);
  } else if (lo > this.mid) {
    return reportRightRange(this.rightPoints, lo, cb);
  } else {
    return reportRange(this.leftPoints, cb);
  }
};
function compareNumbers(a, b) {
  return a - b;
}
function compareBegin(a, b) {
  var d = a[0] - b[0];
  if (d) {
    return d;
  }
  return a[1] - b[1];
}
function compareEnd(a, b) {
  var d = a[1] - b[1];
  if (d) {
    return d;
  }
  return a[0] - b[0];
}
function createIntervalTree(intervals) {
  if (intervals.length === 0) {
    return null;
  }
  var pts = [];
  for (var i = 0; i < intervals.length; ++i) {
    pts.push(intervals[i][0], intervals[i][1]);
  }
  pts.sort(compareNumbers);
  var mid = pts[pts.length >> 1];
  var leftIntervals = [];
  var rightIntervals = [];
  var centerIntervals = [];
  for (var i = 0; i < intervals.length; ++i) {
    var s = intervals[i];
    if (s[1] < mid) {
      leftIntervals.push(s);
    } else if (mid < s[0]) {
      rightIntervals.push(s);
    } else {
      centerIntervals.push(s);
    }
  }
  var leftPoints = centerIntervals;
  var rightPoints = centerIntervals.slice();
  leftPoints.sort(compareBegin);
  rightPoints.sort(compareEnd);
  return new IntervalTreeNode(mid, createIntervalTree(leftIntervals), createIntervalTree(rightIntervals), leftPoints, rightPoints);
}
function IntervalTree(root) {
  this.root = root;
}
var tproto = IntervalTree.prototype;
tproto.insert = function(interval) {
  if (this.root) {
    this.root.insert(interval);
  } else {
    this.root = new IntervalTreeNode(interval[0], null, null, [interval], [interval]);
  }
};
tproto.remove = function(interval) {
  if (this.root) {
    var r2 = this.root.remove(interval);
    if (r2 === EMPTY) {
      this.root = null;
    }
    return r2 !== NOT_FOUND;
  }
  return false;
};
tproto.queryPoint = function(p, cb) {
  if (this.root) {
    return this.root.queryPoint(p, cb);
  }
};
tproto.queryInterval = function(lo, hi, cb) {
  if (lo <= hi && this.root) {
    return this.root.queryInterval(lo, hi, cb);
  }
};
Object.defineProperty(tproto, "count", {
  get: function get() {
    if (this.root) {
      return this.root.count;
    }
    return 0;
  }
});
Object.defineProperty(tproto, "intervals", {
  get: function get2() {
    if (this.root) {
      return this.root.intervals([]);
    }
    return [];
  }
});
function createWrapper(intervals) {
  {
    return new IntervalTree(null);
  }
}
var PositionCache = /* @__PURE__ */ function() {
  function PositionCache2() {
    _classCallCheck(this, PositionCache2);
    _defineProperty(this, "_columnSizeMap", {});
    _defineProperty(this, "_intervalTree", createWrapper());
    _defineProperty(this, "_leftMap", {});
  }
  return _createClass(PositionCache2, [{
    key: "estimateTotalHeight",
    value: function estimateTotalHeight(cellCount, columnCount, defaultCellHeight) {
      var unmeasuredCellCount = cellCount - this.count;
      return this.tallestColumnSize + Math.ceil(unmeasuredCellCount / columnCount) * defaultCellHeight;
    }
    // Render all cells visible within the viewport range defined.
  }, {
    key: "range",
    value: function range(scrollTop, clientHeight, renderCallback) {
      var _this = this;
      this._intervalTree.queryInterval(scrollTop, scrollTop + clientHeight, function(_ref) {
        var _ref2 = _slicedToArray(_ref, 3), top = _ref2[0];
        _ref2[1];
        var index = _ref2[2];
        return renderCallback(index, _this._leftMap[index], top);
      });
    }
  }, {
    key: "setPosition",
    value: function setPosition(index, left, top, height) {
      this._intervalTree.insert([top, top + height, index]);
      this._leftMap[index] = left;
      var columnSizeMap = this._columnSizeMap;
      var columnHeight = columnSizeMap[left];
      if (columnHeight === void 0) {
        columnSizeMap[left] = top + height;
      } else {
        columnSizeMap[left] = Math.max(columnHeight, top + height);
      }
    }
  }, {
    key: "count",
    get: function get3() {
      return this._intervalTree.count;
    }
  }, {
    key: "shortestColumnSize",
    get: function get3() {
      var columnSizeMap = this._columnSizeMap;
      var size = 0;
      for (var i in columnSizeMap) {
        var height = columnSizeMap[i];
        size = size === 0 ? height : Math.min(size, height);
      }
      return size;
    }
  }, {
    key: "tallestColumnSize",
    get: function get3() {
      var columnSizeMap = this._columnSizeMap;
      var size = 0;
      for (var i in columnSizeMap) {
        var height = columnSizeMap[i];
        size = Math.max(size, height);
      }
      return size;
    }
  }]);
}();
function ownKeys$3(e, r2) {
  var t = Object.keys(e);
  if (Object.getOwnPropertySymbols) {
    var o = Object.getOwnPropertySymbols(e);
    r2 && (o = o.filter(function(r3) {
      return Object.getOwnPropertyDescriptor(e, r3).enumerable;
    })), t.push.apply(t, o);
  }
  return t;
}
function _objectSpread$3(e) {
  for (var r2 = 1; r2 < arguments.length; r2++) {
    var t = null != arguments[r2] ? arguments[r2] : {};
    r2 % 2 ? ownKeys$3(Object(t), true).forEach(function(r3) {
      _defineProperty(e, r3, t[r3]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys$3(Object(t)).forEach(function(r3) {
      Object.defineProperty(e, r3, Object.getOwnPropertyDescriptor(t, r3));
    });
  }
  return e;
}
function _callSuper$5(t, o, e) {
  return o = _getPrototypeOf(o), _possibleConstructorReturn(t, _isNativeReflectConstruct$5() ? Reflect.construct(o, e || [], _getPrototypeOf(t).constructor) : o.apply(t, e));
}
function _isNativeReflectConstruct$5() {
  try {
    var t = !Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {
    }));
  } catch (t2) {
  }
  return (_isNativeReflectConstruct$5 = function _isNativeReflectConstruct2() {
    return !!t;
  })();
}
var emptyObject = {};
var DEFAULT_SCROLLING_RESET_TIME_INTERVAL = 150;
var Masonry = /* @__PURE__ */ function(_React$PureComponent) {
  function Masonry2() {
    var _this;
    _classCallCheck(this, Masonry2);
    for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }
    _this = _callSuper$5(this, Masonry2, [].concat(args));
    _defineProperty(_this, "state", {
      isScrolling: false,
      scrollTop: 0
    });
    _defineProperty(_this, "_debounceResetIsScrollingId", void 0);
    _defineProperty(_this, "_invalidateOnUpdateStartIndex", null);
    _defineProperty(_this, "_invalidateOnUpdateStopIndex", null);
    _defineProperty(_this, "_positionCache", new PositionCache());
    _defineProperty(_this, "_startIndex", null);
    _defineProperty(_this, "_startIndexMemoized", null);
    _defineProperty(_this, "_stopIndex", null);
    _defineProperty(_this, "_stopIndexMemoized", null);
    _defineProperty(_this, "_debounceResetIsScrollingCallback", function() {
      _this.setState({
        isScrolling: false
      });
    });
    _defineProperty(_this, "_setScrollingContainerRef", function(ref) {
      _this._scrollingContainer = ref;
    });
    _defineProperty(_this, "_onScroll", function(event) {
      var height = _this.props.height;
      var eventScrollTop = event.currentTarget.scrollTop;
      var scrollTop = Math.min(Math.max(0, _this._getEstimatedTotalHeight() - height), eventScrollTop);
      if (eventScrollTop !== scrollTop) {
        return;
      }
      _this._debounceResetIsScrolling();
      if (_this.state.scrollTop !== scrollTop) {
        _this.setState({
          isScrolling: true,
          scrollTop
        });
      }
    });
    return _this;
  }
  _inherits(Masonry2, _React$PureComponent);
  return _createClass(Masonry2, [{
    key: "clearCellPositions",
    value: function clearCellPositions() {
      this._positionCache = new PositionCache();
      this.forceUpdate();
    }
    // HACK This method signature was intended for Grid
  }, {
    key: "invalidateCellSizeAfterRender",
    value: function invalidateCellSizeAfterRender(_ref) {
      var index = _ref.rowIndex;
      if (this._invalidateOnUpdateStartIndex === null) {
        this._invalidateOnUpdateStartIndex = index;
        this._invalidateOnUpdateStopIndex = index;
      } else {
        this._invalidateOnUpdateStartIndex = Math.min(this._invalidateOnUpdateStartIndex, index);
        this._invalidateOnUpdateStopIndex = Math.max(this._invalidateOnUpdateStopIndex, index);
      }
    }
  }, {
    key: "recomputeCellPositions",
    value: function recomputeCellPositions() {
      var stopIndex = this._positionCache.count - 1;
      this._positionCache = new PositionCache();
      this._populatePositionCache(0, stopIndex);
      this.forceUpdate();
    }
  }, {
    key: "componentDidMount",
    value: function componentDidMount() {
      this._checkInvalidateOnUpdate();
      this._invokeOnScrollCallback();
      this._invokeOnCellsRenderedCallback();
    }
  }, {
    key: "componentDidUpdate",
    value: function componentDidUpdate(prevProps, prevState) {
      this._checkInvalidateOnUpdate();
      this._invokeOnScrollCallback();
      this._invokeOnCellsRenderedCallback();
      if (this.props.scrollTop !== prevProps.scrollTop) {
        this._debounceResetIsScrolling();
      }
    }
  }, {
    key: "componentWillUnmount",
    value: function componentWillUnmount() {
      if (this._debounceResetIsScrollingId) {
        cancelAnimationTimeout(this._debounceResetIsScrollingId);
      }
    }
  }, {
    key: "render",
    value: function render() {
      var _this2 = this;
      var _this$props = this.props, autoHeight = _this$props.autoHeight, cellCount = _this$props.cellCount, cellMeasurerCache = _this$props.cellMeasurerCache, cellRenderer = _this$props.cellRenderer, className = _this$props.className, height = _this$props.height, id = _this$props.id, keyMapper = _this$props.keyMapper, overscanByPixels = _this$props.overscanByPixels, role = _this$props.role, style = _this$props.style, tabIndex = _this$props.tabIndex, width = _this$props.width, rowDirection = _this$props.rowDirection;
      var _this$state = this.state, isScrolling = _this$state.isScrolling, scrollTop = _this$state.scrollTop;
      var children = [];
      var estimateTotalHeight = this._getEstimatedTotalHeight();
      var shortestColumnSize = this._positionCache.shortestColumnSize;
      var measuredCellCount = this._positionCache.count;
      var startIndex = 0;
      var stopIndex;
      this._positionCache.range(Math.max(0, scrollTop - overscanByPixels), height + overscanByPixels * 2, function(index, left, top) {
        if (typeof stopIndex === "undefined") {
          startIndex = index;
          stopIndex = index;
        } else {
          startIndex = Math.min(startIndex, index);
          stopIndex = Math.max(stopIndex, index);
        }
        children.push(cellRenderer({
          index,
          isScrolling,
          key: keyMapper(index),
          parent: _this2,
          style: _defineProperty(_defineProperty(_defineProperty(_defineProperty({
            height: cellMeasurerCache.getHeight(index)
          }, rowDirection === "ltr" ? "left" : "right", left), "position", "absolute"), "top", top), "width", cellMeasurerCache.getWidth(index))
        }));
      });
      if (shortestColumnSize < scrollTop + height + overscanByPixels && measuredCellCount < cellCount) {
        var batchSize = Math.min(cellCount - measuredCellCount, Math.ceil((scrollTop + height + overscanByPixels - shortestColumnSize) / cellMeasurerCache.defaultHeight * width / cellMeasurerCache.defaultWidth));
        for (var _index = measuredCellCount; _index < measuredCellCount + batchSize; _index++) {
          stopIndex = _index;
          children.push(cellRenderer({
            index: _index,
            isScrolling,
            key: keyMapper(_index),
            parent: this,
            style: {
              width: cellMeasurerCache.getWidth(_index)
            }
          }));
        }
      }
      this._startIndex = startIndex;
      this._stopIndex = stopIndex;
      return /* @__PURE__ */ reactExports.createElement("div", {
        ref: this._setScrollingContainerRef,
        "aria-label": this.props["aria-label"],
        className: clsx("ReactVirtualized__Masonry", className),
        id,
        onScroll: this._onScroll,
        role,
        style: _objectSpread$3({
          boxSizing: "border-box",
          direction: "ltr",
          height: autoHeight ? "auto" : height,
          overflowX: "hidden",
          overflowY: estimateTotalHeight < height ? "hidden" : "auto",
          position: "relative",
          width,
          WebkitOverflowScrolling: "touch",
          willChange: "transform"
        }, style),
        tabIndex
      }, /* @__PURE__ */ reactExports.createElement("div", {
        className: "ReactVirtualized__Masonry__innerScrollContainer",
        style: {
          width: "100%",
          height: estimateTotalHeight,
          maxWidth: "100%",
          maxHeight: estimateTotalHeight,
          overflow: "hidden",
          pointerEvents: isScrolling ? "none" : "",
          position: "relative"
        }
      }, children));
    }
  }, {
    key: "_checkInvalidateOnUpdate",
    value: function _checkInvalidateOnUpdate() {
      if (typeof this._invalidateOnUpdateStartIndex === "number") {
        var startIndex = this._invalidateOnUpdateStartIndex;
        var stopIndex = this._invalidateOnUpdateStopIndex;
        this._invalidateOnUpdateStartIndex = null;
        this._invalidateOnUpdateStopIndex = null;
        this._populatePositionCache(startIndex, stopIndex);
        this.forceUpdate();
      }
    }
  }, {
    key: "_debounceResetIsScrolling",
    value: function _debounceResetIsScrolling() {
      var scrollingResetTimeInterval = this.props.scrollingResetTimeInterval;
      if (this._debounceResetIsScrollingId) {
        cancelAnimationTimeout(this._debounceResetIsScrollingId);
      }
      this._debounceResetIsScrollingId = requestAnimationTimeout(this._debounceResetIsScrollingCallback, scrollingResetTimeInterval);
    }
  }, {
    key: "_getEstimatedTotalHeight",
    value: function _getEstimatedTotalHeight() {
      var _this$props2 = this.props, cellCount = _this$props2.cellCount, cellMeasurerCache = _this$props2.cellMeasurerCache, width = _this$props2.width;
      var estimatedColumnCount = Math.max(1, Math.floor(width / cellMeasurerCache.defaultWidth));
      return this._positionCache.estimateTotalHeight(cellCount, estimatedColumnCount, cellMeasurerCache.defaultHeight);
    }
  }, {
    key: "_invokeOnScrollCallback",
    value: function _invokeOnScrollCallback() {
      var _this$props3 = this.props, height = _this$props3.height, onScroll6 = _this$props3.onScroll;
      var scrollTop = this.state.scrollTop;
      if (this._onScrollMemoized !== scrollTop) {
        onScroll6({
          clientHeight: height,
          scrollHeight: this._getEstimatedTotalHeight(),
          scrollTop
        });
        this._onScrollMemoized = scrollTop;
      }
    }
  }, {
    key: "_invokeOnCellsRenderedCallback",
    value: function _invokeOnCellsRenderedCallback() {
      if (this._startIndexMemoized !== this._startIndex || this._stopIndexMemoized !== this._stopIndex) {
        var onCellsRendered = this.props.onCellsRendered;
        onCellsRendered({
          startIndex: this._startIndex,
          stopIndex: this._stopIndex
        });
        this._startIndexMemoized = this._startIndex;
        this._stopIndexMemoized = this._stopIndex;
      }
    }
  }, {
    key: "_populatePositionCache",
    value: function _populatePositionCache(startIndex, stopIndex) {
      var _this$props4 = this.props, cellMeasurerCache = _this$props4.cellMeasurerCache, cellPositioner = _this$props4.cellPositioner;
      for (var _index2 = startIndex; _index2 <= stopIndex; _index2++) {
        var _cellPositioner = cellPositioner(_index2), left = _cellPositioner.left, top = _cellPositioner.top;
        this._positionCache.setPosition(_index2, left, top, cellMeasurerCache.getHeight(_index2));
      }
    }
  }], [{
    key: "getDerivedStateFromProps",
    value: function getDerivedStateFromProps(nextProps, prevState) {
      if (nextProps.scrollTop !== void 0 && prevState.scrollTop !== nextProps.scrollTop) {
        return {
          isScrolling: true,
          scrollTop: nextProps.scrollTop
        };
      }
      return null;
    }
  }]);
}(reactExports.PureComponent);
_defineProperty(Masonry, "defaultProps", {
  autoHeight: false,
  keyMapper: identity,
  onCellsRendered: noop,
  onScroll: noop,
  overscanByPixels: 20,
  role: "grid",
  scrollingResetTimeInterval: DEFAULT_SCROLLING_RESET_TIME_INTERVAL,
  style: emptyObject,
  tabIndex: 0,
  rowDirection: "ltr"
});
function identity(value) {
  return value;
}
function noop() {
}
polyfill(Masonry);
var CellMeasurerCacheDecorator = /* @__PURE__ */ function() {
  function CellMeasurerCacheDecorator2() {
    var _this = this;
    var params = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
    _classCallCheck(this, CellMeasurerCacheDecorator2);
    _defineProperty(this, "_cellMeasurerCache", void 0);
    _defineProperty(this, "_columnIndexOffset", void 0);
    _defineProperty(this, "_rowIndexOffset", void 0);
    _defineProperty(this, "columnWidth", function(_ref) {
      var index = _ref.index;
      _this._cellMeasurerCache.columnWidth({
        index: index + _this._columnIndexOffset
      });
    });
    _defineProperty(this, "rowHeight", function(_ref2) {
      var index = _ref2.index;
      _this._cellMeasurerCache.rowHeight({
        index: index + _this._rowIndexOffset
      });
    });
    var cellMeasurerCache = params.cellMeasurerCache, _params$columnIndexOf = params.columnIndexOffset, columnIndexOffset = _params$columnIndexOf === void 0 ? 0 : _params$columnIndexOf, _params$rowIndexOffse = params.rowIndexOffset, rowIndexOffset = _params$rowIndexOffse === void 0 ? 0 : _params$rowIndexOffse;
    this._cellMeasurerCache = cellMeasurerCache;
    this._columnIndexOffset = columnIndexOffset;
    this._rowIndexOffset = rowIndexOffset;
  }
  return _createClass(CellMeasurerCacheDecorator2, [{
    key: "clear",
    value: function clear(rowIndex, columnIndex) {
      this._cellMeasurerCache.clear(rowIndex + this._rowIndexOffset, columnIndex + this._columnIndexOffset);
    }
  }, {
    key: "clearAll",
    value: function clearAll() {
      this._cellMeasurerCache.clearAll();
    }
  }, {
    key: "defaultHeight",
    get: function get3() {
      return this._cellMeasurerCache.defaultHeight;
    }
  }, {
    key: "defaultWidth",
    get: function get3() {
      return this._cellMeasurerCache.defaultWidth;
    }
  }, {
    key: "hasFixedHeight",
    value: function hasFixedHeight() {
      return this._cellMeasurerCache.hasFixedHeight();
    }
  }, {
    key: "hasFixedWidth",
    value: function hasFixedWidth() {
      return this._cellMeasurerCache.hasFixedWidth();
    }
  }, {
    key: "getHeight",
    value: function getHeight(rowIndex) {
      var columnIndex = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : 0;
      return this._cellMeasurerCache.getHeight(rowIndex + this._rowIndexOffset, columnIndex + this._columnIndexOffset);
    }
  }, {
    key: "getWidth",
    value: function getWidth(rowIndex) {
      var columnIndex = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : 0;
      return this._cellMeasurerCache.getWidth(rowIndex + this._rowIndexOffset, columnIndex + this._columnIndexOffset);
    }
  }, {
    key: "has",
    value: function has(rowIndex) {
      var columnIndex = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : 0;
      return this._cellMeasurerCache.has(rowIndex + this._rowIndexOffset, columnIndex + this._columnIndexOffset);
    }
  }, {
    key: "set",
    value: function set(rowIndex, columnIndex, width, height) {
      this._cellMeasurerCache.set(rowIndex + this._rowIndexOffset, columnIndex + this._columnIndexOffset, width, height);
    }
  }]);
}();
var _excluded = ["rowIndex"], _excluded2 = ["columnIndex", "rowIndex"], _excluded3 = ["columnIndex"], _excluded4 = ["onScroll", "onSectionRendered", "onScrollbarPresenceChange", "scrollLeft", "scrollToColumn", "scrollTop", "scrollToRow"];
function ownKeys$2(e, r2) {
  var t = Object.keys(e);
  if (Object.getOwnPropertySymbols) {
    var o = Object.getOwnPropertySymbols(e);
    r2 && (o = o.filter(function(r22) {
      return Object.getOwnPropertyDescriptor(e, r22).enumerable;
    })), t.push.apply(t, o);
  }
  return t;
}
function _objectSpread$2(e) {
  for (var r2 = 1; r2 < arguments.length; r2++) {
    var t = null != arguments[r2] ? arguments[r2] : {};
    r2 % 2 ? ownKeys$2(Object(t), true).forEach(function(r22) {
      _defineProperty(e, r22, t[r22]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys$2(Object(t)).forEach(function(r22) {
      Object.defineProperty(e, r22, Object.getOwnPropertyDescriptor(t, r22));
    });
  }
  return e;
}
function _callSuper$4(t, o, e) {
  return o = _getPrototypeOf(o), _possibleConstructorReturn(t, _isNativeReflectConstruct$4() ? Reflect.construct(o, e || [], _getPrototypeOf(t).constructor) : o.apply(t, e));
}
function _isNativeReflectConstruct$4() {
  try {
    var t = !Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {
    }));
  } catch (t2) {
  }
  return (_isNativeReflectConstruct$4 = function _isNativeReflectConstruct2() {
    return !!t;
  })();
}
var SCROLLBAR_SIZE_BUFFER = 20;
var MultiGrid = /* @__PURE__ */ function(_React$PureComponent) {
  function MultiGrid2(props, context) {
    var _this;
    _classCallCheck(this, MultiGrid2);
    _this = _callSuper$4(this, MultiGrid2, [props, context]);
    _defineProperty(_this, "state", {
      scrollLeft: 0,
      scrollTop: 0,
      scrollbarSize: 0,
      showHorizontalScrollbar: false,
      showVerticalScrollbar: false
    });
    _defineProperty(_this, "_deferredInvalidateColumnIndex", null);
    _defineProperty(_this, "_deferredInvalidateRowIndex", null);
    _defineProperty(_this, "_bottomLeftGridRef", function(ref) {
      _this._bottomLeftGrid = ref;
    });
    _defineProperty(_this, "_bottomRightGridRef", function(ref) {
      _this._bottomRightGrid = ref;
    });
    _defineProperty(_this, "_cellRendererBottomLeftGrid", function(_ref) {
      var rowIndex = _ref.rowIndex, rest = _objectWithoutProperties(_ref, _excluded);
      var _this$props = _this.props, cellRenderer = _this$props.cellRenderer, fixedRowCount = _this$props.fixedRowCount, rowCount = _this$props.rowCount;
      if (rowIndex === rowCount - fixedRowCount) {
        return /* @__PURE__ */ reactExports.createElement("div", {
          key: rest.key,
          style: _objectSpread$2(_objectSpread$2({}, rest.style), {}, {
            height: SCROLLBAR_SIZE_BUFFER
          })
        });
      } else {
        return cellRenderer(_objectSpread$2(_objectSpread$2({}, rest), {}, {
          parent: _this,
          rowIndex: rowIndex + fixedRowCount
        }));
      }
    });
    _defineProperty(_this, "_cellRendererBottomRightGrid", function(_ref2) {
      var columnIndex = _ref2.columnIndex, rowIndex = _ref2.rowIndex, rest = _objectWithoutProperties(_ref2, _excluded2);
      var _this$props2 = _this.props, cellRenderer = _this$props2.cellRenderer, fixedColumnCount = _this$props2.fixedColumnCount, fixedRowCount = _this$props2.fixedRowCount;
      return cellRenderer(_objectSpread$2(_objectSpread$2({}, rest), {}, {
        columnIndex: columnIndex + fixedColumnCount,
        parent: _this,
        rowIndex: rowIndex + fixedRowCount
      }));
    });
    _defineProperty(_this, "_cellRendererTopRightGrid", function(_ref3) {
      var columnIndex = _ref3.columnIndex, rest = _objectWithoutProperties(_ref3, _excluded3);
      var _this$props3 = _this.props, cellRenderer = _this$props3.cellRenderer, columnCount = _this$props3.columnCount, fixedColumnCount = _this$props3.fixedColumnCount;
      if (columnIndex === columnCount - fixedColumnCount) {
        return /* @__PURE__ */ reactExports.createElement("div", {
          key: rest.key,
          style: _objectSpread$2(_objectSpread$2({}, rest.style), {}, {
            width: SCROLLBAR_SIZE_BUFFER
          })
        });
      } else {
        return cellRenderer(_objectSpread$2(_objectSpread$2({}, rest), {}, {
          columnIndex: columnIndex + fixedColumnCount,
          parent: _this
        }));
      }
    });
    _defineProperty(_this, "_columnWidthRightGrid", function(_ref4) {
      var index = _ref4.index;
      var _this$props4 = _this.props, columnCount = _this$props4.columnCount, fixedColumnCount = _this$props4.fixedColumnCount, columnWidth = _this$props4.columnWidth;
      var _this$state = _this.state, scrollbarSize2 = _this$state.scrollbarSize, showHorizontalScrollbar = _this$state.showHorizontalScrollbar;
      if (showHorizontalScrollbar && index === columnCount - fixedColumnCount) {
        return scrollbarSize2;
      }
      return typeof columnWidth === "function" ? columnWidth({
        index: index + fixedColumnCount
      }) : columnWidth;
    });
    _defineProperty(_this, "_onScroll", function(scrollInfo) {
      var scrollLeft = scrollInfo.scrollLeft, scrollTop = scrollInfo.scrollTop;
      _this.setState({
        scrollLeft,
        scrollTop
      });
      var onScroll6 = _this.props.onScroll;
      if (onScroll6) {
        onScroll6(scrollInfo);
      }
    });
    _defineProperty(_this, "_onScrollbarPresenceChange", function(_ref5) {
      var horizontal = _ref5.horizontal, size = _ref5.size, vertical = _ref5.vertical;
      var _this$state2 = _this.state, showHorizontalScrollbar = _this$state2.showHorizontalScrollbar, showVerticalScrollbar = _this$state2.showVerticalScrollbar;
      if (horizontal !== showHorizontalScrollbar || vertical !== showVerticalScrollbar) {
        _this.setState({
          scrollbarSize: size,
          showHorizontalScrollbar: horizontal,
          showVerticalScrollbar: vertical
        });
        var onScrollbarPresenceChange2 = _this.props.onScrollbarPresenceChange;
        if (typeof onScrollbarPresenceChange2 === "function") {
          onScrollbarPresenceChange2({
            horizontal,
            size,
            vertical
          });
        }
      }
    });
    _defineProperty(_this, "_onScrollLeft", function(scrollInfo) {
      var scrollLeft = scrollInfo.scrollLeft;
      _this._onScroll({
        scrollLeft,
        scrollTop: _this.state.scrollTop
      });
    });
    _defineProperty(_this, "_onScrollTop", function(scrollInfo) {
      var scrollTop = scrollInfo.scrollTop;
      _this._onScroll({
        scrollTop,
        scrollLeft: _this.state.scrollLeft
      });
    });
    _defineProperty(_this, "_rowHeightBottomGrid", function(_ref6) {
      var index = _ref6.index;
      var _this$props5 = _this.props, fixedRowCount = _this$props5.fixedRowCount, rowCount = _this$props5.rowCount, rowHeight = _this$props5.rowHeight;
      var _this$state3 = _this.state, scrollbarSize2 = _this$state3.scrollbarSize, showVerticalScrollbar = _this$state3.showVerticalScrollbar;
      if (showVerticalScrollbar && index === rowCount - fixedRowCount) {
        return scrollbarSize2;
      }
      return typeof rowHeight === "function" ? rowHeight({
        index: index + fixedRowCount
      }) : rowHeight;
    });
    _defineProperty(_this, "_topLeftGridRef", function(ref) {
      _this._topLeftGrid = ref;
    });
    _defineProperty(_this, "_topRightGridRef", function(ref) {
      _this._topRightGrid = ref;
    });
    var deferredMeasurementCache = props.deferredMeasurementCache, _fixedColumnCount = props.fixedColumnCount, _fixedRowCount = props.fixedRowCount;
    _this._maybeCalculateCachedStyles(true);
    if (deferredMeasurementCache) {
      _this._deferredMeasurementCacheBottomLeftGrid = _fixedRowCount > 0 ? new CellMeasurerCacheDecorator({
        cellMeasurerCache: deferredMeasurementCache,
        columnIndexOffset: 0,
        rowIndexOffset: _fixedRowCount
      }) : deferredMeasurementCache;
      _this._deferredMeasurementCacheBottomRightGrid = _fixedColumnCount > 0 || _fixedRowCount > 0 ? new CellMeasurerCacheDecorator({
        cellMeasurerCache: deferredMeasurementCache,
        columnIndexOffset: _fixedColumnCount,
        rowIndexOffset: _fixedRowCount
      }) : deferredMeasurementCache;
      _this._deferredMeasurementCacheTopRightGrid = _fixedColumnCount > 0 ? new CellMeasurerCacheDecorator({
        cellMeasurerCache: deferredMeasurementCache,
        columnIndexOffset: _fixedColumnCount,
        rowIndexOffset: 0
      }) : deferredMeasurementCache;
    }
    return _this;
  }
  _inherits(MultiGrid2, _React$PureComponent);
  return _createClass(MultiGrid2, [{
    key: "forceUpdateGrids",
    value: function forceUpdateGrids() {
      this._bottomLeftGrid && this._bottomLeftGrid.forceUpdate();
      this._bottomRightGrid && this._bottomRightGrid.forceUpdate();
      this._topLeftGrid && this._topLeftGrid.forceUpdate();
      this._topRightGrid && this._topRightGrid.forceUpdate();
    }
    /** See Grid#invalidateCellSizeAfterRender */
  }, {
    key: "invalidateCellSizeAfterRender",
    value: function invalidateCellSizeAfterRender() {
      var _ref7 = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {}, _ref7$columnIndex = _ref7.columnIndex, columnIndex = _ref7$columnIndex === void 0 ? 0 : _ref7$columnIndex, _ref7$rowIndex = _ref7.rowIndex, rowIndex = _ref7$rowIndex === void 0 ? 0 : _ref7$rowIndex;
      this._deferredInvalidateColumnIndex = typeof this._deferredInvalidateColumnIndex === "number" ? Math.min(this._deferredInvalidateColumnIndex, columnIndex) : columnIndex;
      this._deferredInvalidateRowIndex = typeof this._deferredInvalidateRowIndex === "number" ? Math.min(this._deferredInvalidateRowIndex, rowIndex) : rowIndex;
    }
    /** See Grid#measureAllCells */
  }, {
    key: "measureAllCells",
    value: function measureAllCells() {
      this._bottomLeftGrid && this._bottomLeftGrid.measureAllCells();
      this._bottomRightGrid && this._bottomRightGrid.measureAllCells();
      this._topLeftGrid && this._topLeftGrid.measureAllCells();
      this._topRightGrid && this._topRightGrid.measureAllCells();
    }
    /** See Grid#recomputeGridSize */
  }, {
    key: "recomputeGridSize",
    value: function recomputeGridSize() {
      var _ref8 = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {}, _ref8$columnIndex = _ref8.columnIndex, columnIndex = _ref8$columnIndex === void 0 ? 0 : _ref8$columnIndex, _ref8$rowIndex = _ref8.rowIndex, rowIndex = _ref8$rowIndex === void 0 ? 0 : _ref8$rowIndex;
      var _this$props6 = this.props, fixedColumnCount = _this$props6.fixedColumnCount, fixedRowCount = _this$props6.fixedRowCount;
      var adjustedColumnIndex = Math.max(0, columnIndex - fixedColumnCount);
      var adjustedRowIndex = Math.max(0, rowIndex - fixedRowCount);
      this._bottomLeftGrid && this._bottomLeftGrid.recomputeGridSize({
        columnIndex,
        rowIndex: adjustedRowIndex
      });
      this._bottomRightGrid && this._bottomRightGrid.recomputeGridSize({
        columnIndex: adjustedColumnIndex,
        rowIndex: adjustedRowIndex
      });
      this._topLeftGrid && this._topLeftGrid.recomputeGridSize({
        columnIndex,
        rowIndex
      });
      this._topRightGrid && this._topRightGrid.recomputeGridSize({
        columnIndex: adjustedColumnIndex,
        rowIndex
      });
      this._leftGridWidth = null;
      this._topGridHeight = null;
      this._maybeCalculateCachedStyles(true);
    }
  }, {
    key: "componentDidMount",
    value: function componentDidMount() {
      var _this$props7 = this.props, scrollLeft = _this$props7.scrollLeft, scrollTop = _this$props7.scrollTop;
      if (scrollLeft > 0 || scrollTop > 0) {
        var newState = {};
        if (scrollLeft > 0) {
          newState.scrollLeft = scrollLeft;
        }
        if (scrollTop > 0) {
          newState.scrollTop = scrollTop;
        }
        this.setState(newState);
      }
      this._handleInvalidatedGridSize();
    }
  }, {
    key: "componentDidUpdate",
    value: function componentDidUpdate() {
      this._handleInvalidatedGridSize();
    }
  }, {
    key: "render",
    value: function render() {
      var _this$props8 = this.props, onScroll6 = _this$props8.onScroll, onSectionRendered3 = _this$props8.onSectionRendered;
      _this$props8.onScrollbarPresenceChange;
      _this$props8.scrollLeft;
      var scrollToColumn = _this$props8.scrollToColumn;
      _this$props8.scrollTop;
      var scrollToRow = _this$props8.scrollToRow, rest = _objectWithoutProperties(_this$props8, _excluded4);
      this._prepareForRender();
      if (this.props.width === 0 || this.props.height === 0) {
        return null;
      }
      var _this$state4 = this.state, scrollLeft = _this$state4.scrollLeft, scrollTop = _this$state4.scrollTop;
      return /* @__PURE__ */ reactExports.createElement("div", {
        style: this._containerOuterStyle
      }, /* @__PURE__ */ reactExports.createElement("div", {
        style: this._containerTopStyle
      }, this._renderTopLeftGrid(rest), this._renderTopRightGrid(_objectSpread$2(_objectSpread$2({}, rest), {}, {
        onScroll: onScroll6,
        scrollLeft
      }))), /* @__PURE__ */ reactExports.createElement("div", {
        style: this._containerBottomStyle
      }, this._renderBottomLeftGrid(_objectSpread$2(_objectSpread$2({}, rest), {}, {
        onScroll: onScroll6,
        scrollTop
      })), this._renderBottomRightGrid(_objectSpread$2(_objectSpread$2({}, rest), {}, {
        onScroll: onScroll6,
        onSectionRendered: onSectionRendered3,
        scrollLeft,
        scrollToColumn,
        scrollToRow,
        scrollTop
      }))));
    }
  }, {
    key: "_getBottomGridHeight",
    value: function _getBottomGridHeight(props) {
      var height = props.height;
      var topGridHeight = this._getTopGridHeight(props);
      return height - topGridHeight;
    }
  }, {
    key: "_getLeftGridWidth",
    value: function _getLeftGridWidth(props) {
      var fixedColumnCount = props.fixedColumnCount, columnWidth = props.columnWidth;
      if (this._leftGridWidth == null) {
        if (typeof columnWidth === "function") {
          var leftGridWidth = 0;
          for (var index = 0; index < fixedColumnCount; index++) {
            leftGridWidth += columnWidth({
              index
            });
          }
          this._leftGridWidth = leftGridWidth;
        } else {
          this._leftGridWidth = columnWidth * fixedColumnCount;
        }
      }
      return this._leftGridWidth;
    }
  }, {
    key: "_getRightGridWidth",
    value: function _getRightGridWidth(props) {
      var width = props.width;
      var leftGridWidth = this._getLeftGridWidth(props);
      return width - leftGridWidth;
    }
  }, {
    key: "_getTopGridHeight",
    value: function _getTopGridHeight(props) {
      var fixedRowCount = props.fixedRowCount, rowHeight = props.rowHeight;
      if (this._topGridHeight == null) {
        if (typeof rowHeight === "function") {
          var topGridHeight = 0;
          for (var index = 0; index < fixedRowCount; index++) {
            topGridHeight += rowHeight({
              index
            });
          }
          this._topGridHeight = topGridHeight;
        } else {
          this._topGridHeight = rowHeight * fixedRowCount;
        }
      }
      return this._topGridHeight;
    }
  }, {
    key: "_handleInvalidatedGridSize",
    value: function _handleInvalidatedGridSize() {
      if (typeof this._deferredInvalidateColumnIndex === "number") {
        var columnIndex = this._deferredInvalidateColumnIndex;
        var rowIndex = this._deferredInvalidateRowIndex;
        this._deferredInvalidateColumnIndex = null;
        this._deferredInvalidateRowIndex = null;
        this.recomputeGridSize({
          columnIndex,
          rowIndex
        });
        this.forceUpdate();
      }
    }
    /**
     * Avoid recreating inline styles each render; this bypasses Grid's shallowCompare.
     * This method recalculates styles only when specific props change.
     */
  }, {
    key: "_maybeCalculateCachedStyles",
    value: function _maybeCalculateCachedStyles(resetAll) {
      var _this$props9 = this.props, columnWidth = _this$props9.columnWidth, enableFixedColumnScroll = _this$props9.enableFixedColumnScroll, enableFixedRowScroll = _this$props9.enableFixedRowScroll, height = _this$props9.height, fixedColumnCount = _this$props9.fixedColumnCount, fixedRowCount = _this$props9.fixedRowCount, rowHeight = _this$props9.rowHeight, style = _this$props9.style, styleBottomLeftGrid = _this$props9.styleBottomLeftGrid, styleBottomRightGrid = _this$props9.styleBottomRightGrid, styleTopLeftGrid = _this$props9.styleTopLeftGrid, styleTopRightGrid = _this$props9.styleTopRightGrid, width = _this$props9.width;
      var sizeChange = resetAll || height !== this._lastRenderedHeight || width !== this._lastRenderedWidth;
      var leftSizeChange = resetAll || columnWidth !== this._lastRenderedColumnWidth || fixedColumnCount !== this._lastRenderedFixedColumnCount;
      var topSizeChange = resetAll || fixedRowCount !== this._lastRenderedFixedRowCount || rowHeight !== this._lastRenderedRowHeight;
      if (resetAll || sizeChange || style !== this._lastRenderedStyle) {
        this._containerOuterStyle = _objectSpread$2({
          height,
          overflow: "visible",
          // Let :focus outline show through
          width
        }, style);
      }
      if (resetAll || sizeChange || topSizeChange) {
        this._containerTopStyle = {
          height: this._getTopGridHeight(this.props),
          position: "relative",
          width
        };
        this._containerBottomStyle = {
          height: height - this._getTopGridHeight(this.props),
          overflow: "visible",
          // Let :focus outline show through
          position: "relative",
          width
        };
      }
      if (resetAll || styleBottomLeftGrid !== this._lastRenderedStyleBottomLeftGrid) {
        this._bottomLeftGridStyle = _objectSpread$2({
          left: 0,
          overflowX: "hidden",
          overflowY: enableFixedColumnScroll ? "auto" : "hidden",
          position: "absolute"
        }, styleBottomLeftGrid);
      }
      if (resetAll || leftSizeChange || styleBottomRightGrid !== this._lastRenderedStyleBottomRightGrid) {
        this._bottomRightGridStyle = _objectSpread$2({
          left: this._getLeftGridWidth(this.props),
          position: "absolute"
        }, styleBottomRightGrid);
      }
      if (resetAll || styleTopLeftGrid !== this._lastRenderedStyleTopLeftGrid) {
        this._topLeftGridStyle = _objectSpread$2({
          left: 0,
          overflowX: "hidden",
          overflowY: "hidden",
          position: "absolute",
          top: 0
        }, styleTopLeftGrid);
      }
      if (resetAll || leftSizeChange || styleTopRightGrid !== this._lastRenderedStyleTopRightGrid) {
        this._topRightGridStyle = _objectSpread$2({
          left: this._getLeftGridWidth(this.props),
          overflowX: enableFixedRowScroll ? "auto" : "hidden",
          overflowY: "hidden",
          position: "absolute",
          top: 0
        }, styleTopRightGrid);
      }
      this._lastRenderedColumnWidth = columnWidth;
      this._lastRenderedFixedColumnCount = fixedColumnCount;
      this._lastRenderedFixedRowCount = fixedRowCount;
      this._lastRenderedHeight = height;
      this._lastRenderedRowHeight = rowHeight;
      this._lastRenderedStyle = style;
      this._lastRenderedStyleBottomLeftGrid = styleBottomLeftGrid;
      this._lastRenderedStyleBottomRightGrid = styleBottomRightGrid;
      this._lastRenderedStyleTopLeftGrid = styleTopLeftGrid;
      this._lastRenderedStyleTopRightGrid = styleTopRightGrid;
      this._lastRenderedWidth = width;
    }
  }, {
    key: "_prepareForRender",
    value: function _prepareForRender() {
      if (this._lastRenderedColumnWidth !== this.props.columnWidth || this._lastRenderedFixedColumnCount !== this.props.fixedColumnCount) {
        this._leftGridWidth = null;
      }
      if (this._lastRenderedFixedRowCount !== this.props.fixedRowCount || this._lastRenderedRowHeight !== this.props.rowHeight) {
        this._topGridHeight = null;
      }
      this._maybeCalculateCachedStyles();
      this._lastRenderedColumnWidth = this.props.columnWidth;
      this._lastRenderedFixedColumnCount = this.props.fixedColumnCount;
      this._lastRenderedFixedRowCount = this.props.fixedRowCount;
      this._lastRenderedRowHeight = this.props.rowHeight;
    }
  }, {
    key: "_renderBottomLeftGrid",
    value: function _renderBottomLeftGrid(props) {
      var enableFixedColumnScroll = props.enableFixedColumnScroll, fixedColumnCount = props.fixedColumnCount, fixedRowCount = props.fixedRowCount, rowCount = props.rowCount, hideBottomLeftGridScrollbar = props.hideBottomLeftGridScrollbar;
      var showVerticalScrollbar = this.state.showVerticalScrollbar;
      if (!fixedColumnCount) {
        return null;
      }
      var additionalRowCount = showVerticalScrollbar ? 1 : 0, height = this._getBottomGridHeight(props), width = this._getLeftGridWidth(props), scrollbarSize2 = this.state.showVerticalScrollbar ? this.state.scrollbarSize : 0, gridWidth = hideBottomLeftGridScrollbar ? width + scrollbarSize2 : width;
      var bottomLeftGrid = /* @__PURE__ */ reactExports.createElement(Grid, _extends({}, props, {
        cellRenderer: this._cellRendererBottomLeftGrid,
        className: this.props.classNameBottomLeftGrid,
        columnCount: fixedColumnCount,
        deferredMeasurementCache: this._deferredMeasurementCacheBottomLeftGrid,
        height,
        onScroll: enableFixedColumnScroll ? this._onScrollTop : void 0,
        ref: this._bottomLeftGridRef,
        rowCount: Math.max(0, rowCount - fixedRowCount) + additionalRowCount,
        rowHeight: this._rowHeightBottomGrid,
        style: this._bottomLeftGridStyle,
        tabIndex: null,
        width: gridWidth
      }));
      if (hideBottomLeftGridScrollbar) {
        return /* @__PURE__ */ reactExports.createElement("div", {
          className: "BottomLeftGrid_ScrollWrapper",
          style: _objectSpread$2(_objectSpread$2({}, this._bottomLeftGridStyle), {}, {
            height,
            width,
            overflowY: "hidden"
          })
        }, bottomLeftGrid);
      }
      return bottomLeftGrid;
    }
  }, {
    key: "_renderBottomRightGrid",
    value: function _renderBottomRightGrid(props) {
      var columnCount = props.columnCount, fixedColumnCount = props.fixedColumnCount, fixedRowCount = props.fixedRowCount, rowCount = props.rowCount, scrollToColumn = props.scrollToColumn, scrollToRow = props.scrollToRow;
      return /* @__PURE__ */ reactExports.createElement(Grid, _extends({}, props, {
        cellRenderer: this._cellRendererBottomRightGrid,
        className: this.props.classNameBottomRightGrid,
        columnCount: Math.max(0, columnCount - fixedColumnCount),
        columnWidth: this._columnWidthRightGrid,
        deferredMeasurementCache: this._deferredMeasurementCacheBottomRightGrid,
        height: this._getBottomGridHeight(props),
        onScroll: this._onScroll,
        onScrollbarPresenceChange: this._onScrollbarPresenceChange,
        ref: this._bottomRightGridRef,
        rowCount: Math.max(0, rowCount - fixedRowCount),
        rowHeight: this._rowHeightBottomGrid,
        scrollToColumn: scrollToColumn - fixedColumnCount,
        scrollToRow: scrollToRow - fixedRowCount,
        style: this._bottomRightGridStyle,
        width: this._getRightGridWidth(props)
      }));
    }
  }, {
    key: "_renderTopLeftGrid",
    value: function _renderTopLeftGrid(props) {
      var fixedColumnCount = props.fixedColumnCount, fixedRowCount = props.fixedRowCount;
      if (!fixedColumnCount || !fixedRowCount) {
        return null;
      }
      return /* @__PURE__ */ reactExports.createElement(Grid, _extends({}, props, {
        className: this.props.classNameTopLeftGrid,
        columnCount: fixedColumnCount,
        height: this._getTopGridHeight(props),
        ref: this._topLeftGridRef,
        rowCount: fixedRowCount,
        style: this._topLeftGridStyle,
        tabIndex: null,
        width: this._getLeftGridWidth(props)
      }));
    }
  }, {
    key: "_renderTopRightGrid",
    value: function _renderTopRightGrid(props) {
      var columnCount = props.columnCount, enableFixedRowScroll = props.enableFixedRowScroll, fixedColumnCount = props.fixedColumnCount, fixedRowCount = props.fixedRowCount, scrollLeft = props.scrollLeft, hideTopRightGridScrollbar = props.hideTopRightGridScrollbar;
      var _this$state5 = this.state, showHorizontalScrollbar = _this$state5.showHorizontalScrollbar, scrollbarSize2 = _this$state5.scrollbarSize;
      if (!fixedRowCount) {
        return null;
      }
      var additionalColumnCount = showHorizontalScrollbar ? 1 : 0, height = this._getTopGridHeight(props), width = this._getRightGridWidth(props), additionalHeight = showHorizontalScrollbar ? scrollbarSize2 : 0;
      var gridHeight = height, style = this._topRightGridStyle;
      if (hideTopRightGridScrollbar) {
        gridHeight = height + additionalHeight;
        style = _objectSpread$2(_objectSpread$2({}, this._topRightGridStyle), {}, {
          left: 0
        });
      }
      var topRightGrid = /* @__PURE__ */ reactExports.createElement(Grid, _extends({}, props, {
        cellRenderer: this._cellRendererTopRightGrid,
        className: this.props.classNameTopRightGrid,
        columnCount: Math.max(0, columnCount - fixedColumnCount) + additionalColumnCount,
        columnWidth: this._columnWidthRightGrid,
        deferredMeasurementCache: this._deferredMeasurementCacheTopRightGrid,
        height: gridHeight,
        onScroll: enableFixedRowScroll ? this._onScrollLeft : void 0,
        ref: this._topRightGridRef,
        rowCount: fixedRowCount,
        scrollLeft,
        style,
        tabIndex: null,
        width
      }));
      if (hideTopRightGridScrollbar) {
        return /* @__PURE__ */ reactExports.createElement("div", {
          className: "TopRightGrid_ScrollWrapper",
          style: _objectSpread$2(_objectSpread$2({}, this._topRightGridStyle), {}, {
            height,
            width,
            overflowX: "hidden"
          })
        }, topRightGrid);
      }
      return topRightGrid;
    }
  }], [{
    key: "getDerivedStateFromProps",
    value: function getDerivedStateFromProps(nextProps, prevState) {
      if (nextProps.scrollLeft !== prevState.scrollLeft || nextProps.scrollTop !== prevState.scrollTop) {
        return {
          scrollLeft: nextProps.scrollLeft != null && nextProps.scrollLeft >= 0 ? nextProps.scrollLeft : prevState.scrollLeft,
          scrollTop: nextProps.scrollTop != null && nextProps.scrollTop >= 0 ? nextProps.scrollTop : prevState.scrollTop
        };
      }
      return null;
    }
  }]);
}(reactExports.PureComponent);
_defineProperty(MultiGrid, "defaultProps", {
  classNameBottomLeftGrid: "",
  classNameBottomRightGrid: "",
  classNameTopLeftGrid: "",
  classNameTopRightGrid: "",
  enableFixedColumnScroll: false,
  enableFixedRowScroll: false,
  fixedColumnCount: 0,
  fixedRowCount: 0,
  scrollToColumn: -1,
  scrollToRow: -1,
  style: {},
  styleBottomLeftGrid: {},
  styleBottomRightGrid: {},
  styleTopLeftGrid: {},
  styleTopRightGrid: {},
  hideTopRightGridScrollbar: false,
  hideBottomLeftGridScrollbar: false
});
MultiGrid.propTypes = {};
polyfill(MultiGrid);
function _callSuper$3(t, o, e) {
  return o = _getPrototypeOf(o), _possibleConstructorReturn(t, _isNativeReflectConstruct$3() ? Reflect.construct(o, e || [], _getPrototypeOf(t).constructor) : o.apply(t, e));
}
function _isNativeReflectConstruct$3() {
  try {
    var t = !Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {
    }));
  } catch (t2) {
  }
  return (_isNativeReflectConstruct$3 = function _isNativeReflectConstruct2() {
    return !!t;
  })();
}
var ScrollSync = /* @__PURE__ */ function(_React$PureComponent) {
  function ScrollSync2(props, context) {
    var _this;
    _classCallCheck(this, ScrollSync2);
    _this = _callSuper$3(this, ScrollSync2, [props, context]);
    _this.state = {
      clientHeight: 0,
      clientWidth: 0,
      scrollHeight: 0,
      scrollLeft: 0,
      scrollTop: 0,
      scrollWidth: 0
    };
    _this._onScroll = _this._onScroll.bind(_this);
    return _this;
  }
  _inherits(ScrollSync2, _React$PureComponent);
  return _createClass(ScrollSync2, [{
    key: "render",
    value: function render() {
      var children = this.props.children;
      var _this$state = this.state, clientHeight = _this$state.clientHeight, clientWidth = _this$state.clientWidth, scrollHeight = _this$state.scrollHeight, scrollLeft = _this$state.scrollLeft, scrollTop = _this$state.scrollTop, scrollWidth = _this$state.scrollWidth;
      return children({
        clientHeight,
        clientWidth,
        onScroll: this._onScroll,
        scrollHeight,
        scrollLeft,
        scrollTop,
        scrollWidth
      });
    }
  }, {
    key: "_onScroll",
    value: function _onScroll(_ref) {
      var clientHeight = _ref.clientHeight, clientWidth = _ref.clientWidth, scrollHeight = _ref.scrollHeight, scrollLeft = _ref.scrollLeft, scrollTop = _ref.scrollTop, scrollWidth = _ref.scrollWidth;
      this.setState({
        clientHeight,
        clientWidth,
        scrollHeight,
        scrollLeft,
        scrollTop,
        scrollWidth
      });
    }
  }]);
}(reactExports.PureComponent);
ScrollSync.propTypes = {};
function defaultCellDataGetter(_ref) {
  var dataKey = _ref.dataKey, rowData = _ref.rowData;
  if (typeof rowData.get === "function") {
    return rowData.get(dataKey);
  } else {
    return rowData[dataKey];
  }
}
function defaultCellRenderer(_ref) {
  var cellData = _ref.cellData;
  if (cellData == null) {
    return "";
  } else {
    return String(cellData);
  }
}
function defaultHeaderRowRenderer(_ref) {
  var className = _ref.className, columns = _ref.columns, style = _ref.style;
  return /* @__PURE__ */ reactExports.createElement("div", {
    className,
    role: "row",
    style
  }, columns);
}
var SortDirection = {
  /**
   * Sort items in ascending order.
   * This means arranging from the lowest value to the highest (e.g. a-z, 0-9).
   */
  ASC: "ASC",
  /**
   * Sort items in descending order.
   * This means arranging from the highest value to the lowest (e.g. z-a, 9-0).
   */
  DESC: "DESC"
};
function SortIndicator(_ref) {
  var sortDirection = _ref.sortDirection;
  var classNames = clsx("ReactVirtualized__Table__sortableHeaderIcon", {
    "ReactVirtualized__Table__sortableHeaderIcon--ASC": sortDirection === SortDirection.ASC,
    "ReactVirtualized__Table__sortableHeaderIcon--DESC": sortDirection === SortDirection.DESC
  });
  return /* @__PURE__ */ reactExports.createElement("svg", {
    className: classNames,
    width: 18,
    height: 18,
    viewBox: "0 0 24 24"
  }, sortDirection === SortDirection.ASC ? /* @__PURE__ */ reactExports.createElement("path", {
    d: "M7 14l5-5 5 5z"
  }) : /* @__PURE__ */ reactExports.createElement("path", {
    d: "M7 10l5 5 5-5z"
  }), /* @__PURE__ */ reactExports.createElement("path", {
    d: "M0 0h24v24H0z",
    fill: "none"
  }));
}
SortIndicator.propTypes = {};
function defaultHeaderRenderer(_ref) {
  var dataKey = _ref.dataKey, label = _ref.label, sortBy = _ref.sortBy, sortDirection = _ref.sortDirection;
  var showSortIndicator = sortBy === dataKey;
  var children = [/* @__PURE__ */ reactExports.createElement("span", {
    className: "ReactVirtualized__Table__headerTruncatedText",
    key: "label",
    title: typeof label === "string" ? label : null
  }, label)];
  if (showSortIndicator) {
    children.push(/* @__PURE__ */ reactExports.createElement(SortIndicator, {
      key: "SortIndicator",
      sortDirection
    }));
  }
  return children;
}
function defaultRowRenderer(_ref) {
  var className = _ref.className, columns = _ref.columns, index = _ref.index, key = _ref.key, onRowClick = _ref.onRowClick, onRowDoubleClick = _ref.onRowDoubleClick, onRowMouseOut = _ref.onRowMouseOut, onRowMouseOver = _ref.onRowMouseOver, onRowRightClick = _ref.onRowRightClick, rowData = _ref.rowData, style = _ref.style;
  var a11yProps = {
    "aria-rowindex": index + 1
  };
  if (onRowClick || onRowDoubleClick || onRowMouseOut || onRowMouseOver || onRowRightClick) {
    a11yProps["aria-label"] = "row";
    a11yProps.tabIndex = 0;
    if (onRowClick) {
      a11yProps.onClick = function(event) {
        return onRowClick({
          event,
          index,
          rowData
        });
      };
    }
    if (onRowDoubleClick) {
      a11yProps.onDoubleClick = function(event) {
        return onRowDoubleClick({
          event,
          index,
          rowData
        });
      };
    }
    if (onRowMouseOut) {
      a11yProps.onMouseOut = function(event) {
        return onRowMouseOut({
          event,
          index,
          rowData
        });
      };
    }
    if (onRowMouseOver) {
      a11yProps.onMouseOver = function(event) {
        return onRowMouseOver({
          event,
          index,
          rowData
        });
      };
    }
    if (onRowRightClick) {
      a11yProps.onContextMenu = function(event) {
        return onRowRightClick({
          event,
          index,
          rowData
        });
      };
    }
  }
  return /* @__PURE__ */ reactExports.createElement("div", _extends({}, a11yProps, {
    className,
    key,
    role: "row",
    style
  }), columns);
}
function _callSuper$2(t, o, e) {
  return o = _getPrototypeOf(o), _possibleConstructorReturn(t, _isNativeReflectConstruct$2() ? Reflect.construct(o, e || [], _getPrototypeOf(t).constructor) : o.apply(t, e));
}
function _isNativeReflectConstruct$2() {
  try {
    var t = !Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {
    }));
  } catch (t2) {
  }
  return (_isNativeReflectConstruct$2 = function _isNativeReflectConstruct2() {
    return !!t;
  })();
}
var Column = /* @__PURE__ */ function(_React$Component) {
  function Column2() {
    _classCallCheck(this, Column2);
    return _callSuper$2(this, Column2, arguments);
  }
  _inherits(Column2, _React$Component);
  return _createClass(Column2);
}(reactExports.Component);
_defineProperty(Column, "defaultProps", {
  cellDataGetter: defaultCellDataGetter,
  cellRenderer: defaultCellRenderer,
  defaultSortDirection: SortDirection.ASC,
  flexGrow: 0,
  flexShrink: 1,
  headerRenderer: defaultHeaderRenderer,
  style: {}
});
Column.propTypes = {};
function ownKeys$1(e, r2) {
  var t = Object.keys(e);
  if (Object.getOwnPropertySymbols) {
    var o = Object.getOwnPropertySymbols(e);
    r2 && (o = o.filter(function(r22) {
      return Object.getOwnPropertyDescriptor(e, r22).enumerable;
    })), t.push.apply(t, o);
  }
  return t;
}
function _objectSpread$1(e) {
  for (var r2 = 1; r2 < arguments.length; r2++) {
    var t = null != arguments[r2] ? arguments[r2] : {};
    r2 % 2 ? ownKeys$1(Object(t), true).forEach(function(r22) {
      _defineProperty(e, r22, t[r22]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys$1(Object(t)).forEach(function(r22) {
      Object.defineProperty(e, r22, Object.getOwnPropertyDescriptor(t, r22));
    });
  }
  return e;
}
function _callSuper$1(t, o, e) {
  return o = _getPrototypeOf(o), _possibleConstructorReturn(t, _isNativeReflectConstruct$1() ? Reflect.construct(o, e || [], _getPrototypeOf(t).constructor) : o.apply(t, e));
}
function _isNativeReflectConstruct$1() {
  try {
    var t = !Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {
    }));
  } catch (t2) {
  }
  return (_isNativeReflectConstruct$1 = function _isNativeReflectConstruct2() {
    return !!t;
  })();
}
var Table = /* @__PURE__ */ function(_React$PureComponent) {
  function Table2(props) {
    var _this;
    _classCallCheck(this, Table2);
    _this = _callSuper$1(this, Table2, [props]);
    _this.state = {
      scrollbarWidth: 0
    };
    _this._createColumn = _this._createColumn.bind(_this);
    _this._createRow = _this._createRow.bind(_this);
    _this._onScroll = _this._onScroll.bind(_this);
    _this._onSectionRendered = _this._onSectionRendered.bind(_this);
    _this._setRef = _this._setRef.bind(_this);
    _this._setGridElementRef = _this._setGridElementRef.bind(_this);
    return _this;
  }
  _inherits(Table2, _React$PureComponent);
  return _createClass(Table2, [{
    key: "forceUpdateGrid",
    value: function forceUpdateGrid() {
      if (this.Grid) {
        this.Grid.forceUpdate();
      }
    }
    /** See Grid#getOffsetForCell */
  }, {
    key: "getOffsetForRow",
    value: function getOffsetForRow(_ref) {
      var alignment = _ref.alignment, index = _ref.index;
      if (this.Grid) {
        var _this$Grid$getOffsetF = this.Grid.getOffsetForCell({
          alignment,
          rowIndex: index
        }), scrollTop = _this$Grid$getOffsetF.scrollTop;
        return scrollTop;
      }
      return 0;
    }
    /** CellMeasurer compatibility */
  }, {
    key: "invalidateCellSizeAfterRender",
    value: function invalidateCellSizeAfterRender(_ref2) {
      var columnIndex = _ref2.columnIndex, rowIndex = _ref2.rowIndex;
      if (this.Grid) {
        this.Grid.invalidateCellSizeAfterRender({
          rowIndex,
          columnIndex
        });
      }
    }
    /** See Grid#measureAllCells */
  }, {
    key: "measureAllRows",
    value: function measureAllRows() {
      if (this.Grid) {
        this.Grid.measureAllCells();
      }
    }
    /** CellMeasurer compatibility */
  }, {
    key: "recomputeGridSize",
    value: function recomputeGridSize() {
      var _ref3 = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {}, _ref3$columnIndex = _ref3.columnIndex, columnIndex = _ref3$columnIndex === void 0 ? 0 : _ref3$columnIndex, _ref3$rowIndex = _ref3.rowIndex, rowIndex = _ref3$rowIndex === void 0 ? 0 : _ref3$rowIndex;
      if (this.Grid) {
        this.Grid.recomputeGridSize({
          rowIndex,
          columnIndex
        });
      }
    }
    /** See Grid#recomputeGridSize */
  }, {
    key: "recomputeRowHeights",
    value: function recomputeRowHeights() {
      var index = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : 0;
      if (this.Grid) {
        this.Grid.recomputeGridSize({
          rowIndex: index
        });
      }
    }
    /** See Grid#scrollToPosition */
  }, {
    key: "scrollToPosition",
    value: function scrollToPosition() {
      var scrollTop = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : 0;
      if (this.Grid) {
        this.Grid.scrollToPosition({
          scrollTop
        });
      }
    }
    /** See Grid#scrollToCell */
  }, {
    key: "scrollToRow",
    value: function scrollToRow() {
      var index = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : 0;
      if (this.Grid) {
        this.Grid.scrollToCell({
          columnIndex: 0,
          rowIndex: index
        });
      }
    }
  }, {
    key: "getScrollbarWidth",
    value: function getScrollbarWidth() {
      if (this.GridElement) {
        var _Grid = this.GridElement;
        var clientWidth = _Grid.clientWidth || 0;
        var offsetWidth = _Grid.offsetWidth || 0;
        return offsetWidth - clientWidth;
      }
      return 0;
    }
  }, {
    key: "componentDidMount",
    value: function componentDidMount() {
      this._setScrollbarWidth();
    }
  }, {
    key: "componentDidUpdate",
    value: function componentDidUpdate() {
      this._setScrollbarWidth();
    }
  }, {
    key: "render",
    value: function render() {
      var _this2 = this;
      var _this$props = this.props, children2 = _this$props.children, className = _this$props.className, disableHeader = _this$props.disableHeader, gridClassName = _this$props.gridClassName, gridStyle = _this$props.gridStyle, headerHeight = _this$props.headerHeight, headerRowRenderer = _this$props.headerRowRenderer, height = _this$props.height, id = _this$props.id, noRowsRenderer22 = _this$props.noRowsRenderer, rowClassName = _this$props.rowClassName, rowStyle = _this$props.rowStyle, scrollToIndex = _this$props.scrollToIndex, style = _this$props.style, width = _this$props.width;
      var scrollbarWidth = this.state.scrollbarWidth;
      var availableRowsHeight = disableHeader ? height : height - headerHeight;
      var rowClass = typeof rowClassName === "function" ? rowClassName({
        index: -1
      }) : rowClassName;
      var rowStyleObject = typeof rowStyle === "function" ? rowStyle({
        index: -1
      }) : rowStyle;
      this._cachedColumnStyles = [];
      reactExports.Children.toArray(children2).forEach(function(column, index) {
        var flexStyles = _this2._getFlexStyleForColumn(column, column.props.style || Column.defaultProps.style);
        _this2._cachedColumnStyles[index] = _objectSpread$1({
          overflow: "hidden"
        }, flexStyles);
      });
      return /* @__PURE__ */ reactExports.createElement("div", {
        "aria-label": this.props["aria-label"],
        "aria-labelledby": this.props["aria-labelledby"],
        "aria-colcount": reactExports.Children.toArray(children2).length,
        "aria-rowcount": this.props.rowCount,
        className: clsx("ReactVirtualized__Table", className),
        id,
        role: "grid",
        style
      }, !disableHeader && headerRowRenderer({
        className: clsx("ReactVirtualized__Table__headerRow", rowClass),
        columns: this._getHeaderColumns(),
        style: _objectSpread$1({
          height: headerHeight,
          overflow: "hidden",
          paddingRight: scrollbarWidth,
          width
        }, rowStyleObject)
      }), /* @__PURE__ */ reactExports.createElement(Grid, _extends({}, this.props, {
        elementRef: this._setGridElementRef,
        "aria-readonly": null,
        autoContainerWidth: true,
        className: clsx("ReactVirtualized__Table__Grid", gridClassName),
        cellRenderer: this._createRow,
        columnWidth: width,
        columnCount: 1,
        height: availableRowsHeight,
        id: void 0,
        noContentRenderer: noRowsRenderer22,
        onScroll: this._onScroll,
        onSectionRendered: this._onSectionRendered,
        ref: this._setRef,
        role: "rowgroup",
        scrollbarWidth,
        scrollToRow: scrollToIndex,
        style: _objectSpread$1(_objectSpread$1({}, gridStyle), {}, {
          overflowX: "hidden"
        })
      })));
    }
  }, {
    key: "_createColumn",
    value: function _createColumn(_ref4) {
      var column = _ref4.column, columnIndex = _ref4.columnIndex, isScrolling = _ref4.isScrolling, parent = _ref4.parent, rowData = _ref4.rowData, rowIndex = _ref4.rowIndex;
      var onColumnClick = this.props.onColumnClick;
      var _column$props = column.props, cellDataGetter = _column$props.cellDataGetter, cellRenderer = _column$props.cellRenderer, className = _column$props.className, columnData = _column$props.columnData, dataKey = _column$props.dataKey, id = _column$props.id;
      var cellData = cellDataGetter({
        columnData,
        dataKey,
        rowData
      });
      var renderedCell = cellRenderer({
        cellData,
        columnData,
        columnIndex,
        dataKey,
        isScrolling,
        parent,
        rowData,
        rowIndex
      });
      var onClick = function onClick2(event) {
        onColumnClick && onColumnClick({
          columnData,
          dataKey,
          event
        });
      };
      var style = this._cachedColumnStyles[columnIndex];
      var title = typeof renderedCell === "string" ? renderedCell : null;
      return /* @__PURE__ */ reactExports.createElement("div", {
        "aria-colindex": columnIndex + 1,
        "aria-describedby": id,
        className: clsx("ReactVirtualized__Table__rowColumn", className),
        key: "Row" + rowIndex + "-Col" + columnIndex,
        onClick,
        role: "gridcell",
        style,
        title
      }, renderedCell);
    }
  }, {
    key: "_createHeader",
    value: function _createHeader(_ref5) {
      var column = _ref5.column, index = _ref5.index;
      var _this$props2 = this.props, headerClassName = _this$props2.headerClassName, headerStyle = _this$props2.headerStyle, onHeaderClick = _this$props2.onHeaderClick, sort = _this$props2.sort, sortBy = _this$props2.sortBy, sortDirection = _this$props2.sortDirection;
      var _column$props2 = column.props, columnData = _column$props2.columnData, dataKey = _column$props2.dataKey, defaultSortDirection = _column$props2.defaultSortDirection, disableSort = _column$props2.disableSort, headerRenderer = _column$props2.headerRenderer, id = _column$props2.id, label = _column$props2.label;
      var sortEnabled = !disableSort && sort;
      var classNames = clsx("ReactVirtualized__Table__headerColumn", headerClassName, column.props.headerClassName, {
        ReactVirtualized__Table__sortableHeaderColumn: sortEnabled
      });
      var style = this._getFlexStyleForColumn(column, _objectSpread$1(_objectSpread$1({}, headerStyle), column.props.headerStyle));
      var renderedHeader = headerRenderer({
        columnData,
        dataKey,
        disableSort,
        label,
        sortBy,
        sortDirection
      });
      var headerOnClick, headerOnKeyDown, headerTabIndex, headerAriaSort, headerAriaLabel;
      if (sortEnabled || onHeaderClick) {
        var isFirstTimeSort = sortBy !== dataKey;
        var newSortDirection = isFirstTimeSort ? defaultSortDirection : sortDirection === SortDirection.DESC ? SortDirection.ASC : SortDirection.DESC;
        var onClick = function onClick2(event) {
          sortEnabled && sort({
            defaultSortDirection,
            event,
            sortBy: dataKey,
            sortDirection: newSortDirection
          });
          onHeaderClick && onHeaderClick({
            columnData,
            dataKey,
            event
          });
        };
        var onKeyDown = function onKeyDown2(event) {
          if (event.key === "Enter" || event.key === " ") {
            onClick(event);
          }
        };
        headerAriaLabel = column.props["aria-label"] || label || dataKey;
        headerAriaSort = "none";
        headerTabIndex = 0;
        headerOnClick = onClick;
        headerOnKeyDown = onKeyDown;
      }
      if (sortBy === dataKey) {
        headerAriaSort = sortDirection === SortDirection.ASC ? "ascending" : "descending";
      }
      return /* @__PURE__ */ reactExports.createElement("div", {
        "aria-label": headerAriaLabel,
        "aria-sort": headerAriaSort,
        className: classNames,
        id,
        key: "Header-Col" + index,
        onClick: headerOnClick,
        onKeyDown: headerOnKeyDown,
        role: "columnheader",
        style,
        tabIndex: headerTabIndex
      }, renderedHeader);
    }
  }, {
    key: "_createRow",
    value: function _createRow(_ref6) {
      var _this3 = this;
      var index = _ref6.rowIndex, isScrolling = _ref6.isScrolling, key = _ref6.key, parent = _ref6.parent, style = _ref6.style;
      var _this$props3 = this.props, children2 = _this$props3.children, onRowClick = _this$props3.onRowClick, onRowDoubleClick = _this$props3.onRowDoubleClick, onRowRightClick = _this$props3.onRowRightClick, onRowMouseOver = _this$props3.onRowMouseOver, onRowMouseOut = _this$props3.onRowMouseOut, rowClassName = _this$props3.rowClassName, rowGetter = _this$props3.rowGetter, rowRenderer = _this$props3.rowRenderer, rowStyle = _this$props3.rowStyle;
      var scrollbarWidth = this.state.scrollbarWidth;
      var rowClass = typeof rowClassName === "function" ? rowClassName({
        index
      }) : rowClassName;
      var rowStyleObject = typeof rowStyle === "function" ? rowStyle({
        index
      }) : rowStyle;
      var rowData = rowGetter({
        index
      });
      var columns = reactExports.Children.toArray(children2).map(function(column, columnIndex) {
        return _this3._createColumn({
          column,
          columnIndex,
          isScrolling,
          parent,
          rowData,
          rowIndex: index,
          scrollbarWidth
        });
      });
      var className = clsx("ReactVirtualized__Table__row", rowClass);
      var flattenedStyle = _objectSpread$1(_objectSpread$1({}, style), {}, {
        height: this._getRowHeight(index),
        overflow: "hidden",
        paddingRight: scrollbarWidth
      }, rowStyleObject);
      return rowRenderer({
        className,
        columns,
        index,
        isScrolling,
        key,
        onRowClick,
        onRowDoubleClick,
        onRowRightClick,
        onRowMouseOver,
        onRowMouseOut,
        rowData,
        style: flattenedStyle
      });
    }
    /**
     * Determines the flex-shrink, flex-grow, and width values for a cell (header or column).
     */
  }, {
    key: "_getFlexStyleForColumn",
    value: function _getFlexStyleForColumn(column) {
      var customStyle = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
      var flexValue = "".concat(column.props.flexGrow, " ").concat(column.props.flexShrink, " ").concat(column.props.width, "px");
      var style = _objectSpread$1(_objectSpread$1({}, customStyle), {}, {
        flex: flexValue,
        msFlex: flexValue,
        WebkitFlex: flexValue
      });
      if (column.props.maxWidth) {
        style.maxWidth = column.props.maxWidth;
      }
      if (column.props.minWidth) {
        style.minWidth = column.props.minWidth;
      }
      return style;
    }
  }, {
    key: "_getHeaderColumns",
    value: function _getHeaderColumns() {
      var _this4 = this;
      var _this$props4 = this.props, children2 = _this$props4.children, disableHeader = _this$props4.disableHeader;
      var items = disableHeader ? [] : reactExports.Children.toArray(children2);
      return items.map(function(column, index) {
        return _this4._createHeader({
          column,
          index
        });
      });
    }
  }, {
    key: "_getRowHeight",
    value: function _getRowHeight(rowIndex) {
      var rowHeight = this.props.rowHeight;
      return typeof rowHeight === "function" ? rowHeight({
        index: rowIndex
      }) : rowHeight;
    }
  }, {
    key: "_onScroll",
    value: function _onScroll(_ref7) {
      var clientHeight = _ref7.clientHeight, scrollHeight = _ref7.scrollHeight, scrollTop = _ref7.scrollTop;
      var onScroll22 = this.props.onScroll;
      onScroll22({
        clientHeight,
        scrollHeight,
        scrollTop
      });
    }
  }, {
    key: "_onSectionRendered",
    value: function _onSectionRendered(_ref8) {
      var rowOverscanStartIndex = _ref8.rowOverscanStartIndex, rowOverscanStopIndex = _ref8.rowOverscanStopIndex, rowStartIndex = _ref8.rowStartIndex, rowStopIndex = _ref8.rowStopIndex;
      var onRowsRendered22 = this.props.onRowsRendered;
      onRowsRendered22({
        overscanStartIndex: rowOverscanStartIndex,
        overscanStopIndex: rowOverscanStopIndex,
        startIndex: rowStartIndex,
        stopIndex: rowStopIndex
      });
    }
  }, {
    key: "_setRef",
    value: function _setRef(ref) {
      this.Grid = ref;
    }
  }, {
    key: "_setGridElementRef",
    value: function _setGridElementRef(ref) {
      this.GridElement = ref;
    }
  }, {
    key: "_setScrollbarWidth",
    value: function _setScrollbarWidth() {
      var scrollbarWidth = this.getScrollbarWidth();
      this.setState({
        scrollbarWidth
      });
    }
  }]);
}(reactExports.PureComponent);
_defineProperty(Table, "defaultProps", {
  disableHeader: false,
  estimatedRowSize: 30,
  headerHeight: 0,
  headerStyle: {},
  noRowsRenderer: function noRowsRenderer2() {
    return null;
  },
  onRowsRendered: function onRowsRendered2() {
    return null;
  },
  onScroll: function onScroll4() {
    return null;
  },
  overscanIndicesGetter: defaultOverscanIndicesGetter,
  overscanRowCount: 10,
  rowRenderer: defaultRowRenderer,
  headerRowRenderer: defaultHeaderRowRenderer,
  rowStyle: {},
  scrollToAlignment: "auto",
  scrollToIndex: -1,
  style: {}
});
Table.propTypes = {};
var mountedInstances = [];
var originalBodyPointerEvents = null;
var disablePointerEventsTimeoutId = null;
function enablePointerEventsIfDisabled() {
  if (disablePointerEventsTimeoutId) {
    disablePointerEventsTimeoutId = null;
    if (document.body && originalBodyPointerEvents != null) {
      document.body.style.pointerEvents = originalBodyPointerEvents;
    }
    originalBodyPointerEvents = null;
  }
}
function enablePointerEventsAfterDelayCallback() {
  enablePointerEventsIfDisabled();
  mountedInstances.forEach(function(instance) {
    return instance.__resetIsScrolling();
  });
}
function enablePointerEventsAfterDelay() {
  if (disablePointerEventsTimeoutId) {
    cancelAnimationTimeout(disablePointerEventsTimeoutId);
  }
  var maximumTimeout = 0;
  mountedInstances.forEach(function(instance) {
    maximumTimeout = Math.max(maximumTimeout, instance.props.scrollingResetTimeInterval);
  });
  disablePointerEventsTimeoutId = requestAnimationTimeout(enablePointerEventsAfterDelayCallback, maximumTimeout);
}
function onScrollWindow(event) {
  if (event.currentTarget === window && originalBodyPointerEvents == null && document.body) {
    originalBodyPointerEvents = document.body.style.pointerEvents;
    document.body.style.pointerEvents = "none";
  }
  enablePointerEventsAfterDelay();
  mountedInstances.forEach(function(instance) {
    if (instance.props.scrollElement === event.currentTarget) {
      instance.__handleWindowScrollEvent();
    }
  });
}
function registerScrollListener(component, element) {
  if (!mountedInstances.some(function(instance) {
    return instance.props.scrollElement === element;
  })) {
    element.addEventListener("scroll", onScrollWindow);
  }
  mountedInstances.push(component);
}
function unregisterScrollListener(component, element) {
  mountedInstances = mountedInstances.filter(function(instance) {
    return instance !== component;
  });
  if (!mountedInstances.length) {
    element.removeEventListener("scroll", onScrollWindow);
    if (disablePointerEventsTimeoutId) {
      cancelAnimationTimeout(disablePointerEventsTimeoutId);
      enablePointerEventsIfDisabled();
    }
  }
}
var isWindow = function isWindow2(element) {
  return element === window;
};
var getBoundingBox = function getBoundingBox2(element) {
  return element.getBoundingClientRect();
};
function getDimensions(scrollElement, props) {
  if (!scrollElement) {
    return {
      height: props.serverHeight,
      width: props.serverWidth
    };
  } else if (isWindow(scrollElement)) {
    var _window = window, innerHeight = _window.innerHeight, innerWidth = _window.innerWidth;
    return {
      height: typeof innerHeight === "number" ? innerHeight : 0,
      width: typeof innerWidth === "number" ? innerWidth : 0
    };
  } else {
    return getBoundingBox(scrollElement);
  }
}
function getPositionOffset(element, container) {
  if (isWindow(container) && document.documentElement) {
    var containerElement = document.documentElement;
    var elementRect = getBoundingBox(element);
    var containerRect = getBoundingBox(containerElement);
    return {
      top: elementRect.top - containerRect.top,
      left: elementRect.left - containerRect.left
    };
  } else {
    var scrollOffset = getScrollOffset(container);
    var _elementRect = getBoundingBox(element);
    var _containerRect = getBoundingBox(container);
    return {
      top: _elementRect.top + scrollOffset.top - _containerRect.top,
      left: _elementRect.left + scrollOffset.left - _containerRect.left
    };
  }
}
function getScrollOffset(element) {
  if (isWindow(element) && document.documentElement) {
    return {
      top: "scrollY" in window ? window.scrollY : document.documentElement.scrollTop,
      left: "scrollX" in window ? window.scrollX : document.documentElement.scrollLeft
    };
  } else {
    return {
      top: element.scrollTop,
      left: element.scrollLeft
    };
  }
}
function ownKeys(e, r2) {
  var t = Object.keys(e);
  if (Object.getOwnPropertySymbols) {
    var o = Object.getOwnPropertySymbols(e);
    r2 && (o = o.filter(function(r3) {
      return Object.getOwnPropertyDescriptor(e, r3).enumerable;
    })), t.push.apply(t, o);
  }
  return t;
}
function _objectSpread(e) {
  for (var r2 = 1; r2 < arguments.length; r2++) {
    var t = null != arguments[r2] ? arguments[r2] : {};
    r2 % 2 ? ownKeys(Object(t), true).forEach(function(r3) {
      _defineProperty(e, r3, t[r3]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function(r3) {
      Object.defineProperty(e, r3, Object.getOwnPropertyDescriptor(t, r3));
    });
  }
  return e;
}
function _callSuper(t, o, e) {
  return o = _getPrototypeOf(o), _possibleConstructorReturn(t, _isNativeReflectConstruct() ? Reflect.construct(o, e || [], _getPrototypeOf(t).constructor) : o.apply(t, e));
}
function _isNativeReflectConstruct() {
  try {
    var t = !Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {
    }));
  } catch (t2) {
  }
  return (_isNativeReflectConstruct = function _isNativeReflectConstruct2() {
    return !!t;
  })();
}
var IS_SCROLLING_TIMEOUT = 150;
var getWindow = function getWindow2() {
  return typeof window !== "undefined" ? window : void 0;
};
var WindowScroller = /* @__PURE__ */ function(_React$PureComponent) {
  function WindowScroller2() {
    var _this;
    _classCallCheck(this, WindowScroller2);
    for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }
    _this = _callSuper(this, WindowScroller2, [].concat(args));
    _defineProperty(_this, "_window", getWindow());
    _defineProperty(_this, "_isMounted", false);
    _defineProperty(_this, "_positionFromTop", 0);
    _defineProperty(_this, "_positionFromLeft", 0);
    _defineProperty(_this, "_detectElementResize", void 0);
    _defineProperty(_this, "_child", void 0);
    _defineProperty(_this, "_windowScrollerRef", /* @__PURE__ */ reactExports.createRef());
    _defineProperty(_this, "state", _objectSpread(_objectSpread({}, getDimensions(_this.props.scrollElement, _this.props)), {}, {
      isScrolling: false,
      scrollLeft: 0,
      scrollTop: 0
    }));
    _defineProperty(_this, "_registerChild", function(element) {
      if (element && !(element instanceof Element)) {
        console.warn("WindowScroller registerChild expects to be passed Element or null");
      }
      _this._child = element;
      _this.updatePosition();
    });
    _defineProperty(_this, "_onChildScroll", function(_ref) {
      var scrollTop = _ref.scrollTop;
      if (_this.state.scrollTop === scrollTop) {
        return;
      }
      var scrollElement = _this.props.scrollElement;
      if (scrollElement) {
        if (typeof scrollElement.scrollTo === "function") {
          scrollElement.scrollTo(0, scrollTop + _this._positionFromTop);
        } else {
          scrollElement.scrollTop = scrollTop + _this._positionFromTop;
        }
      }
    });
    _defineProperty(_this, "_registerResizeListener", function(element) {
      if (element === window) {
        window.addEventListener("resize", _this._onResize, false);
      } else {
        _this._detectElementResize.addResizeListener(element, _this._onResize);
      }
    });
    _defineProperty(_this, "_unregisterResizeListener", function(element) {
      if (element === window) {
        window.removeEventListener("resize", _this._onResize, false);
      } else if (element) {
        _this._detectElementResize.removeResizeListener(element, _this._onResize);
      }
    });
    _defineProperty(_this, "_onResize", function() {
      _this.updatePosition();
    });
    _defineProperty(_this, "__handleWindowScrollEvent", function() {
      if (!_this._isMounted) {
        return;
      }
      var onScroll6 = _this.props.onScroll;
      var scrollElement = _this.props.scrollElement;
      if (scrollElement) {
        var scrollOffset = getScrollOffset(scrollElement);
        var scrollLeft = Math.max(0, scrollOffset.left - _this._positionFromLeft);
        var scrollTop = Math.max(0, scrollOffset.top - _this._positionFromTop);
        _this.setState({
          isScrolling: true,
          scrollLeft,
          scrollTop
        });
        onScroll6({
          scrollLeft,
          scrollTop
        });
      }
    });
    _defineProperty(_this, "__resetIsScrolling", function() {
      _this.setState({
        isScrolling: false
      });
    });
    return _this;
  }
  _inherits(WindowScroller2, _React$PureComponent);
  return _createClass(WindowScroller2, [{
    key: "updatePosition",
    value: function updatePosition() {
      var scrollElement = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : this.props.scrollElement;
      var onResize3 = this.props.onResize;
      var _this$state = this.state, height = _this$state.height, width = _this$state.width;
      var thisNode = this._child || this._windowScrollerRef.current;
      if (thisNode instanceof Element && scrollElement) {
        var offset = getPositionOffset(thisNode, scrollElement);
        this._positionFromTop = offset.top;
        this._positionFromLeft = offset.left;
      }
      var dimensions = getDimensions(scrollElement, this.props);
      if (height !== dimensions.height || width !== dimensions.width) {
        this.setState({
          height: dimensions.height,
          width: dimensions.width
        });
        onResize3({
          height: dimensions.height,
          width: dimensions.width
        });
      }
      if (this.props.updateScrollTopOnUpdatePosition === true) {
        this.__handleWindowScrollEvent();
        this.__resetIsScrolling();
      }
    }
  }, {
    key: "componentDidMount",
    value: function componentDidMount() {
      var scrollElement = this.props.scrollElement;
      this._detectElementResize = createDetectElementResize();
      this.updatePosition(scrollElement);
      if (scrollElement) {
        registerScrollListener(this, scrollElement);
        this._registerResizeListener(scrollElement);
      }
      this._isMounted = true;
    }
  }, {
    key: "componentDidUpdate",
    value: function componentDidUpdate(prevProps, prevState) {
      var scrollElement = this.props.scrollElement;
      var prevScrollElement = prevProps.scrollElement;
      if (prevScrollElement !== scrollElement && prevScrollElement != null && scrollElement != null) {
        this.updatePosition(scrollElement);
        unregisterScrollListener(this, prevScrollElement);
        registerScrollListener(this, scrollElement);
        this._unregisterResizeListener(prevScrollElement);
        this._registerResizeListener(scrollElement);
      }
    }
  }, {
    key: "componentWillUnmount",
    value: function componentWillUnmount() {
      var scrollElement = this.props.scrollElement;
      if (scrollElement) {
        unregisterScrollListener(this, scrollElement);
        this._unregisterResizeListener(scrollElement);
      }
      this._isMounted = false;
    }
  }, {
    key: "render",
    value: function render() {
      var children = this.props.children;
      var _this$state2 = this.state, isScrolling = _this$state2.isScrolling, scrollTop = _this$state2.scrollTop, scrollLeft = _this$state2.scrollLeft, height = _this$state2.height, width = _this$state2.width;
      return /* @__PURE__ */ reactExports.createElement("div", {
        ref: this._windowScrollerRef
      }, children({
        onChildScroll: this._onChildScroll,
        registerChild: this._registerChild,
        height,
        isScrolling,
        scrollLeft,
        scrollTop,
        width
      }));
    }
  }]);
}(reactExports.PureComponent);
_defineProperty(WindowScroller, "defaultProps", {
  onResize: function onResize2() {
  },
  onScroll: function onScroll5() {
  },
  scrollingResetTimeInterval: IS_SCROLLING_TIMEOUT,
  scrollElement: getWindow(),
  serverHeight: 0,
  serverWidth: 0
});
export {
  AutoSizer as A,
  CellMeasurerCache as C,
  List as L,
  CellMeasurer as a,
  useVirtualizer as u
};
