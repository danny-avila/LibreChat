"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _react = require("react");
var _reactDom = _interopRequireDefault(require("react-dom"));
var _canUseDom = _interopRequireDefault(require("./Dom/canUseDom"));
var Portal = /*#__PURE__*/(0, _react.forwardRef)(function (props, ref) {
  var didUpdate = props.didUpdate,
    getContainer = props.getContainer,
    children = props.children;
  var parentRef = (0, _react.useRef)();
  var containerRef = (0, _react.useRef)();

  // Ref return nothing, only for wrapper check exist
  (0, _react.useImperativeHandle)(ref, function () {
    return {};
  });

  // Create container in client side with sync to avoid useEffect not get ref
  var initRef = (0, _react.useRef)(false);
  if (!initRef.current && (0, _canUseDom.default)()) {
    containerRef.current = getContainer();
    parentRef.current = containerRef.current.parentNode;
    initRef.current = true;
  }

  // [Legacy] Used by `rc-trigger`
  (0, _react.useEffect)(function () {
    didUpdate === null || didUpdate === void 0 || didUpdate(props);
  });
  (0, _react.useEffect)(function () {
    // Restore container to original place
    // React 18 StrictMode will unmount first and mount back for effect test:
    // https://reactjs.org/blog/2022/03/29/react-v18.html#new-strict-mode-behaviors
    if (containerRef.current.parentNode === null && parentRef.current !== null) {
      parentRef.current.appendChild(containerRef.current);
    }
    return function () {
      var _containerRef$current;
      // [Legacy] This should not be handle by Portal but parent PortalWrapper instead.
      // Since some component use `Portal` directly, we have to keep the logic here.
      (_containerRef$current = containerRef.current) === null || _containerRef$current === void 0 || (_containerRef$current = _containerRef$current.parentNode) === null || _containerRef$current === void 0 || _containerRef$current.removeChild(containerRef.current);
    };
  }, []);
  return containerRef.current ? /*#__PURE__*/_reactDom.default.createPortal(children, containerRef.current) : null;
});
var _default = exports.default = Portal;