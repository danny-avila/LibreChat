import _extends from "@babel/runtime/helpers/esm/extends";
import _defineProperty from "@babel/runtime/helpers/esm/defineProperty";
/* eslint-disable react/no-unknown-property */
import * as React from 'react';
import classNames from 'classnames';
import useMobile from "rc-util/es/hooks/useMobile";

/**
 * When click and hold on a button - the speed of auto changing the value.
 */
var STEP_INTERVAL = 200;

/**
 * When click and hold on a button - the delay before auto changing the value.
 */
var STEP_DELAY = 600;
export default function StepHandler(_ref) {
  var prefixCls = _ref.prefixCls,
    upNode = _ref.upNode,
    downNode = _ref.downNode,
    upDisabled = _ref.upDisabled,
    downDisabled = _ref.downDisabled,
    onStep = _ref.onStep;
  // ======================== Step ========================
  var stepTimeoutRef = React.useRef();
  var onStepRef = React.useRef();
  onStepRef.current = onStep;

  // We will interval update step when hold mouse down
  var onStepMouseDown = function onStepMouseDown(e, up) {
    e.preventDefault();
    onStepRef.current(up);

    // Loop step for interval
    function loopStep() {
      onStepRef.current(up);
      stepTimeoutRef.current = setTimeout(loopStep, STEP_INTERVAL);
    }

    // First time press will wait some time to trigger loop step update
    stepTimeoutRef.current = setTimeout(loopStep, STEP_DELAY);
  };
  var onStopStep = function onStopStep() {
    clearTimeout(stepTimeoutRef.current);
  };
  React.useEffect(function () {
    return onStopStep;
  }, []);

  // ======================= Render =======================
  var isMobile = useMobile();
  if (isMobile) {
    return null;
  }
  var handlerClassName = "".concat(prefixCls, "-handler");
  var upClassName = classNames(handlerClassName, "".concat(handlerClassName, "-up"), _defineProperty({}, "".concat(handlerClassName, "-up-disabled"), upDisabled));
  var downClassName = classNames(handlerClassName, "".concat(handlerClassName, "-down"), _defineProperty({}, "".concat(handlerClassName, "-down-disabled"), downDisabled));
  var sharedHandlerProps = {
    unselectable: 'on',
    role: 'button',
    onMouseUp: onStopStep,
    onMouseLeave: onStopStep
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "".concat(handlerClassName, "-wrap")
  }, /*#__PURE__*/React.createElement("span", _extends({}, sharedHandlerProps, {
    onMouseDown: function onMouseDown(e) {
      onStepMouseDown(e, true);
    },
    "aria-label": "Increase Value",
    "aria-disabled": upDisabled,
    className: upClassName
  }), upNode || /*#__PURE__*/React.createElement("span", {
    unselectable: "on",
    className: "".concat(prefixCls, "-handler-up-inner")
  })), /*#__PURE__*/React.createElement("span", _extends({}, sharedHandlerProps, {
    onMouseDown: function onMouseDown(e) {
      onStepMouseDown(e, false);
    },
    "aria-label": "Decrease Value",
    "aria-disabled": downDisabled,
    className: downClassName
  }), downNode || /*#__PURE__*/React.createElement("span", {
    unselectable: "on",
    className: "".concat(prefixCls, "-handler-down-inner")
  })));
}