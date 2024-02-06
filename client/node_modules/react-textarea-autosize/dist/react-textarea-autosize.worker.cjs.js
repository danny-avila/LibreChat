'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var _extends = require('@babel/runtime/helpers/extends');
var _objectWithoutPropertiesLoose = require('@babel/runtime/helpers/objectWithoutPropertiesLoose');
var React = require('react');
var useComposedRef = require('use-composed-ref');

function _interopDefault (e) { return e && e.__esModule ? e : { 'default': e }; }

function _interopNamespace(e) {
  if (e && e.__esModule) return e;
  var n = Object.create(null);
  if (e) {
    Object.keys(e).forEach(function (k) {
      if (k !== 'default') {
        var d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: function () { return e[k]; }
        });
      }
    });
  }
  n["default"] = e;
  return Object.freeze(n);
}

var React__namespace = /*#__PURE__*/_interopNamespace(React);
var useComposedRef__default = /*#__PURE__*/_interopDefault(useComposedRef);

var noop = function noop() {};

var _excluded = ["cacheMeasurements", "maxRows", "minRows", "onChange", "onHeightChange"];
var TextareaAutosize = function TextareaAutosize(_ref, userRef) {
  _ref.cacheMeasurements;
    _ref.maxRows;
    _ref.minRows;
    var _ref$onChange = _ref.onChange,
    onChange = _ref$onChange === void 0 ? noop : _ref$onChange;
    _ref.onHeightChange;
    var props = _objectWithoutPropertiesLoose(_ref, _excluded);
  props.value !== undefined;
  var libRef = React__namespace.useRef(null);
  var ref = useComposedRef__default["default"](libRef, userRef);
  React__namespace.useRef(0);
  React__namespace.useRef();
  return /*#__PURE__*/React__namespace.createElement("textarea", _extends({}, props, {
    onChange: onChange,
    ref: ref
  }));
};
var index = /* #__PURE__ */React__namespace.forwardRef(TextareaAutosize);

exports["default"] = index;
