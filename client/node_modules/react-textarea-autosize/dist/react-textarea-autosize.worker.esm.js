import _extends from '@babel/runtime/helpers/esm/extends';
import _objectWithoutPropertiesLoose from '@babel/runtime/helpers/esm/objectWithoutPropertiesLoose';
import * as React from 'react';
import useComposedRef from 'use-composed-ref';

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
  var libRef = React.useRef(null);
  var ref = useComposedRef(libRef, userRef);
  React.useRef(0);
  React.useRef();
  return /*#__PURE__*/React.createElement("textarea", _extends({}, props, {
    onChange: onChange,
    ref: ref
  }));
};
var index = /* #__PURE__ */React.forwardRef(TextareaAutosize);

export { index as default };
