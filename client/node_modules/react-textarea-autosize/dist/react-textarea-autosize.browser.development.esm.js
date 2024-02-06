import _extends from '@babel/runtime/helpers/esm/extends';
import _objectWithoutPropertiesLoose from '@babel/runtime/helpers/esm/objectWithoutPropertiesLoose';
import * as React from 'react';
import useLatest from 'use-latest';
import useComposedRef from 'use-composed-ref';

var HIDDEN_TEXTAREA_STYLE = {
  'min-height': '0',
  'max-height': 'none',
  height: '0',
  visibility: 'hidden',
  overflow: 'hidden',
  position: 'absolute',
  'z-index': '-1000',
  top: '0',
  right: '0'
};
var forceHiddenStyles = function forceHiddenStyles(node) {
  Object.keys(HIDDEN_TEXTAREA_STYLE).forEach(function (key) {
    node.style.setProperty(key, HIDDEN_TEXTAREA_STYLE[key], 'important');
  });
};
var forceHiddenStyles$1 = forceHiddenStyles;

// TODO: use labelled tuples once they are avaiable:
//   export type CalculatedNodeHeights = [height: number, rowHeight: number];
// https://github.com/microsoft/TypeScript/issues/28259

var hiddenTextarea = null;
var getHeight = function getHeight(node, sizingData) {
  var height = node.scrollHeight;
  if (sizingData.sizingStyle.boxSizing === 'border-box') {
    // border-box: add border, since height = content + padding + border
    return height + sizingData.borderSize;
  }

  // remove padding, since height = content
  return height - sizingData.paddingSize;
};
function calculateNodeHeight(sizingData, value, minRows, maxRows) {
  if (minRows === void 0) {
    minRows = 1;
  }
  if (maxRows === void 0) {
    maxRows = Infinity;
  }
  if (!hiddenTextarea) {
    hiddenTextarea = document.createElement('textarea');
    hiddenTextarea.setAttribute('tabindex', '-1');
    hiddenTextarea.setAttribute('aria-hidden', 'true');
    forceHiddenStyles$1(hiddenTextarea);
  }
  if (hiddenTextarea.parentNode === null) {
    document.body.appendChild(hiddenTextarea);
  }
  var paddingSize = sizingData.paddingSize,
    borderSize = sizingData.borderSize,
    sizingStyle = sizingData.sizingStyle;
  var boxSizing = sizingStyle.boxSizing;
  Object.keys(sizingStyle).forEach(function (_key) {
    var key = _key;
    hiddenTextarea.style[key] = sizingStyle[key];
  });
  forceHiddenStyles$1(hiddenTextarea);
  hiddenTextarea.value = value;
  var height = getHeight(hiddenTextarea, sizingData);
  // Double set and calc due to Firefox bug: https://bugzilla.mozilla.org/show_bug.cgi?id=1795904
  hiddenTextarea.value = value;
  height = getHeight(hiddenTextarea, sizingData);

  // measure height of a textarea with a single row
  hiddenTextarea.value = 'x';
  var rowHeight = hiddenTextarea.scrollHeight - paddingSize;
  var minHeight = rowHeight * minRows;
  if (boxSizing === 'border-box') {
    minHeight = minHeight + paddingSize + borderSize;
  }
  height = Math.max(minHeight, height);
  var maxHeight = rowHeight * maxRows;
  if (boxSizing === 'border-box') {
    maxHeight = maxHeight + paddingSize + borderSize;
  }
  height = Math.min(maxHeight, height);
  return [height, rowHeight];
}

var noop = function noop() {};
var pick = function pick(props, obj) {
  return props.reduce(function (acc, prop) {
    acc[prop] = obj[prop];
    return acc;
  }, {});
};

var SIZING_STYLE = ['borderBottomWidth', 'borderLeftWidth', 'borderRightWidth', 'borderTopWidth', 'boxSizing', 'fontFamily', 'fontSize', 'fontStyle', 'fontWeight', 'letterSpacing', 'lineHeight', 'paddingBottom', 'paddingLeft', 'paddingRight', 'paddingTop',
// non-standard
'tabSize', 'textIndent',
// non-standard
'textRendering', 'textTransform', 'width', 'wordBreak'];
var isIE = !!document.documentElement.currentStyle ;
var getSizingData = function getSizingData(node) {
  var style = window.getComputedStyle(node);
  if (style === null) {
    return null;
  }
  var sizingStyle = pick(SIZING_STYLE, style);
  var boxSizing = sizingStyle.boxSizing;

  // probably node is detached from DOM, can't read computed dimensions
  if (boxSizing === '') {
    return null;
  }

  // IE (Edge has already correct behaviour) returns content width as computed width
  // so we need to add manually padding and border widths
  if (isIE && boxSizing === 'border-box') {
    sizingStyle.width = parseFloat(sizingStyle.width) + parseFloat(sizingStyle.borderRightWidth) + parseFloat(sizingStyle.borderLeftWidth) + parseFloat(sizingStyle.paddingRight) + parseFloat(sizingStyle.paddingLeft) + 'px';
  }
  var paddingSize = parseFloat(sizingStyle.paddingBottom) + parseFloat(sizingStyle.paddingTop);
  var borderSize = parseFloat(sizingStyle.borderBottomWidth) + parseFloat(sizingStyle.borderTopWidth);
  return {
    sizingStyle: sizingStyle,
    paddingSize: paddingSize,
    borderSize: borderSize
  };
};
var getSizingData$1 = getSizingData;

function useListener(target, type, listener) {
  var latestListener = useLatest(listener);
  React.useLayoutEffect(function () {
    var handler = function handler(ev) {
      return latestListener.current(ev);
    };

    // might happen if document.fonts is not defined, for instance
    if (!target) {
      return;
    }
    target.addEventListener(type, handler);
    return function () {
      return target.removeEventListener(type, handler);
    };
  }, []);
}
var useWindowResizeListener = function useWindowResizeListener(listener) {
  useListener(window, 'resize', listener);
};
var useFontsLoadedListener = function useFontsLoadedListener(listener) {
  useListener(document.fonts, 'loadingdone', listener);
};

var _excluded = ["cacheMeasurements", "maxRows", "minRows", "onChange", "onHeightChange"];
var TextareaAutosize = function TextareaAutosize(_ref, userRef) {
  var cacheMeasurements = _ref.cacheMeasurements,
    maxRows = _ref.maxRows,
    minRows = _ref.minRows,
    _ref$onChange = _ref.onChange,
    onChange = _ref$onChange === void 0 ? noop : _ref$onChange,
    _ref$onHeightChange = _ref.onHeightChange,
    onHeightChange = _ref$onHeightChange === void 0 ? noop : _ref$onHeightChange,
    props = _objectWithoutPropertiesLoose(_ref, _excluded);
  if (props.style) {
    if ('maxHeight' in props.style) {
      throw new Error('Using `style.maxHeight` for <TextareaAutosize/> is not supported. Please use `maxRows`.');
    }
    if ('minHeight' in props.style) {
      throw new Error('Using `style.minHeight` for <TextareaAutosize/> is not supported. Please use `minRows`.');
    }
  }
  var isControlled = props.value !== undefined;
  var libRef = React.useRef(null);
  var ref = useComposedRef(libRef, userRef);
  var heightRef = React.useRef(0);
  var measurementsCacheRef = React.useRef();
  var resizeTextarea = function resizeTextarea() {
    var node = libRef.current;
    var nodeSizingData = cacheMeasurements && measurementsCacheRef.current ? measurementsCacheRef.current : getSizingData$1(node);
    if (!nodeSizingData) {
      return;
    }
    measurementsCacheRef.current = nodeSizingData;
    var _calculateNodeHeight = calculateNodeHeight(nodeSizingData, node.value || node.placeholder || 'x', minRows, maxRows),
      height = _calculateNodeHeight[0],
      rowHeight = _calculateNodeHeight[1];
    if (heightRef.current !== height) {
      heightRef.current = height;
      node.style.setProperty('height', height + "px", 'important');
      onHeightChange(height, {
        rowHeight: rowHeight
      });
    }
  };
  var handleChange = function handleChange(event) {
    if (!isControlled) {
      resizeTextarea();
    }
    onChange(event);
  };
  {
    React.useLayoutEffect(resizeTextarea);
    useWindowResizeListener(resizeTextarea);
    useFontsLoadedListener(resizeTextarea);
    return /*#__PURE__*/React.createElement("textarea", _extends({}, props, {
      onChange: handleChange,
      ref: ref
    }));
  }
};
var index = /* #__PURE__ */React.forwardRef(TextareaAutosize);

export { index as default };
