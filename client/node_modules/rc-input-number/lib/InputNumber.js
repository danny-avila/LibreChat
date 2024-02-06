"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");
var _typeof3 = require("@babel/runtime/helpers/typeof");
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _extends2 = _interopRequireDefault(require("@babel/runtime/helpers/extends"));
var _defineProperty2 = _interopRequireDefault(require("@babel/runtime/helpers/defineProperty"));
var _typeof2 = _interopRequireDefault(require("@babel/runtime/helpers/typeof"));
var _slicedToArray2 = _interopRequireDefault(require("@babel/runtime/helpers/slicedToArray"));
var _objectWithoutProperties2 = _interopRequireDefault(require("@babel/runtime/helpers/objectWithoutProperties"));
var React = _interopRequireWildcard(require("react"));
var _classnames = _interopRequireDefault(require("classnames"));
var _KeyCode = _interopRequireDefault(require("rc-util/lib/KeyCode"));
var _useLayoutEffect = require("rc-util/lib/hooks/useLayoutEffect");
var _ref = require("rc-util/lib/ref");
var _miniDecimal = _interopRequireWildcard(require("@rc-component/mini-decimal"));
var _StepHandler = _interopRequireDefault(require("./StepHandler"));
var _numberUtil = require("./utils/numberUtil");
var _useCursor3 = _interopRequireDefault(require("./hooks/useCursor"));
var _useFrame = _interopRequireDefault(require("./hooks/useFrame"));
var _excluded = ["prefixCls", "className", "style", "min", "max", "step", "defaultValue", "value", "disabled", "readOnly", "upHandler", "downHandler", "keyboard", "controls", "stringMode", "parser", "formatter", "precision", "decimalSeparator", "onChange", "onInput", "onPressEnter", "onStep"];
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function _getRequireWildcardCache(nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || _typeof3(obj) !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
/**
 * We support `stringMode` which need handle correct type when user call in onChange
 * format max or min value
 * 1. if isInvalid return null
 * 2. if precision is undefined, return decimal
 * 3. format with precision
 *    I. if max > 0, round down with precision. Example: max= 3.5, precision=0  afterFormat: 3
 *    II. if max < 0, round up with precision. Example: max= -3.5, precision=0  afterFormat: -4
 *    III. if min > 0, round up with precision. Example: min= 3.5, precision=0  afterFormat: 4
 *    IV. if min < 0, round down with precision. Example: max= -3.5, precision=0  afterFormat: -3
 */
var getDecimalValue = function getDecimalValue(stringMode, decimalValue) {
  if (stringMode || decimalValue.isEmpty()) {
    return decimalValue.toString();
  }
  return decimalValue.toNumber();
};
var getDecimalIfValidate = function getDecimalIfValidate(value) {
  var decimal = (0, _miniDecimal.default)(value);
  return decimal.isInvalidate() ? null : decimal;
};
var InputNumber = /*#__PURE__*/React.forwardRef(function (props, ref) {
  var _classNames;
  var _props$prefixCls = props.prefixCls,
    prefixCls = _props$prefixCls === void 0 ? 'rc-input-number' : _props$prefixCls,
    className = props.className,
    style = props.style,
    min = props.min,
    max = props.max,
    _props$step = props.step,
    step = _props$step === void 0 ? 1 : _props$step,
    defaultValue = props.defaultValue,
    value = props.value,
    disabled = props.disabled,
    readOnly = props.readOnly,
    upHandler = props.upHandler,
    downHandler = props.downHandler,
    keyboard = props.keyboard,
    _props$controls = props.controls,
    controls = _props$controls === void 0 ? true : _props$controls,
    stringMode = props.stringMode,
    parser = props.parser,
    formatter = props.formatter,
    precision = props.precision,
    decimalSeparator = props.decimalSeparator,
    onChange = props.onChange,
    onInput = props.onInput,
    onPressEnter = props.onPressEnter,
    onStep = props.onStep,
    inputProps = (0, _objectWithoutProperties2.default)(props, _excluded);
  var inputClassName = "".concat(prefixCls, "-input");
  var inputRef = React.useRef(null);
  var _React$useState = React.useState(false),
    _React$useState2 = (0, _slicedToArray2.default)(_React$useState, 2),
    focus = _React$useState2[0],
    setFocus = _React$useState2[1];
  var userTypingRef = React.useRef(false);
  var compositionRef = React.useRef(false);
  var shiftKeyRef = React.useRef(false);

  // ============================ Value =============================
  // Real value control
  var _React$useState3 = React.useState(function () {
      return (0, _miniDecimal.default)(value !== null && value !== void 0 ? value : defaultValue);
    }),
    _React$useState4 = (0, _slicedToArray2.default)(_React$useState3, 2),
    decimalValue = _React$useState4[0],
    setDecimalValue = _React$useState4[1];
  function setUncontrolledDecimalValue(newDecimal) {
    if (value === undefined) {
      setDecimalValue(newDecimal);
    }
  }

  // ====================== Parser & Formatter ======================
  /**
   * `precision` is used for formatter & onChange.
   * It will auto generate by `value` & `step`.
   * But it will not block user typing.
   *
   * Note: Auto generate `precision` is used for legacy logic.
   * We should remove this since we already support high precision with BigInt.
   *
   * @param number  Provide which number should calculate precision
   * @param userTyping  Change by user typing
   */
  var getPrecision = React.useCallback(function (numStr, userTyping) {
    if (userTyping) {
      return undefined;
    }
    if (precision >= 0) {
      return precision;
    }
    return Math.max((0, _miniDecimal.getNumberPrecision)(numStr), (0, _miniDecimal.getNumberPrecision)(step));
  }, [precision, step]);

  // >>> Parser
  var mergedParser = React.useCallback(function (num) {
    var numStr = String(num);
    if (parser) {
      return parser(numStr);
    }
    var parsedStr = numStr;
    if (decimalSeparator) {
      parsedStr = parsedStr.replace(decimalSeparator, '.');
    }

    // [Legacy] We still support auto convert `$ 123,456` to `123456`
    return parsedStr.replace(/[^\w.-]+/g, '');
  }, [parser, decimalSeparator]);

  // >>> Formatter
  var inputValueRef = React.useRef('');
  var mergedFormatter = React.useCallback(function (number, userTyping) {
    if (formatter) {
      return formatter(number, {
        userTyping: userTyping,
        input: String(inputValueRef.current)
      });
    }
    var str = typeof number === 'number' ? (0, _miniDecimal.num2str)(number) : number;

    // User typing will not auto format with precision directly
    if (!userTyping) {
      var mergedPrecision = getPrecision(str, userTyping);
      if ((0, _miniDecimal.validateNumber)(str) && (decimalSeparator || mergedPrecision >= 0)) {
        // Separator
        var separatorStr = decimalSeparator || '.';
        str = (0, _miniDecimal.toFixed)(str, separatorStr, mergedPrecision);
      }
    }
    return str;
  }, [formatter, getPrecision, decimalSeparator]);

  // ========================== InputValue ==========================
  /**
   * Input text value control
   *
   * User can not update input content directly. It update with follow rules by priority:
   *  1. controlled `value` changed
   *    * [SPECIAL] Typing like `1.` should not immediately convert to `1`
   *  2. User typing with format (not precision)
   *  3. Blur or Enter trigger revalidate
   */
  var _React$useState5 = React.useState(function () {
      var initValue = defaultValue !== null && defaultValue !== void 0 ? defaultValue : value;
      if (decimalValue.isInvalidate() && ['string', 'number'].includes((0, _typeof2.default)(initValue))) {
        return Number.isNaN(initValue) ? '' : initValue;
      }
      return mergedFormatter(decimalValue.toString(), false);
    }),
    _React$useState6 = (0, _slicedToArray2.default)(_React$useState5, 2),
    inputValue = _React$useState6[0],
    setInternalInputValue = _React$useState6[1];
  inputValueRef.current = inputValue;

  // Should always be string
  function setInputValue(newValue, userTyping) {
    setInternalInputValue(mergedFormatter(
    // Invalidate number is sometime passed by external control, we should let it go
    // Otherwise is controlled by internal interactive logic which check by userTyping
    // You can ref 'show limited value when input is not focused' test for more info.
    newValue.isInvalidate() ? newValue.toString(false) : newValue.toString(!userTyping), userTyping));
  }

  // >>> Max & Min limit
  var maxDecimal = React.useMemo(function () {
    return getDecimalIfValidate(max);
  }, [max, precision]);
  var minDecimal = React.useMemo(function () {
    return getDecimalIfValidate(min);
  }, [min, precision]);
  var upDisabled = React.useMemo(function () {
    if (!maxDecimal || !decimalValue || decimalValue.isInvalidate()) {
      return false;
    }
    return maxDecimal.lessEquals(decimalValue);
  }, [maxDecimal, decimalValue]);
  var downDisabled = React.useMemo(function () {
    if (!minDecimal || !decimalValue || decimalValue.isInvalidate()) {
      return false;
    }
    return decimalValue.lessEquals(minDecimal);
  }, [minDecimal, decimalValue]);

  // Cursor controller
  var _useCursor = (0, _useCursor3.default)(inputRef.current, focus),
    _useCursor2 = (0, _slicedToArray2.default)(_useCursor, 2),
    recordCursor = _useCursor2[0],
    restoreCursor = _useCursor2[1];

  // ============================= Data =============================
  /**
   * Find target value closet within range.
   * e.g. [11, 28]:
   *    3  => 11
   *    23 => 23
   *    99 => 28
   */
  var getRangeValue = function getRangeValue(target) {
    // target > max
    if (maxDecimal && !target.lessEquals(maxDecimal)) {
      return maxDecimal;
    }

    // target < min
    if (minDecimal && !minDecimal.lessEquals(target)) {
      return minDecimal;
    }
    return null;
  };

  /**
   * Check value is in [min, max] range
   */
  var isInRange = function isInRange(target) {
    return !getRangeValue(target);
  };

  /**
   * Trigger `onChange` if value validated and not equals of origin.
   * Return the value that re-align in range.
   */
  var triggerValueUpdate = function triggerValueUpdate(newValue, userTyping) {
    var updateValue = newValue;
    var isRangeValidate = isInRange(updateValue) || updateValue.isEmpty();

    // Skip align value when trigger value is empty.
    // We just trigger onChange(null)
    // This should not block user typing
    if (!updateValue.isEmpty() && !userTyping) {
      // Revert value in range if needed
      updateValue = getRangeValue(updateValue) || updateValue;
      isRangeValidate = true;
    }
    if (!readOnly && !disabled && isRangeValidate) {
      var numStr = updateValue.toString();
      var mergedPrecision = getPrecision(numStr, userTyping);
      if (mergedPrecision >= 0) {
        updateValue = (0, _miniDecimal.default)((0, _miniDecimal.toFixed)(numStr, '.', mergedPrecision));

        // When to fixed. The value may out of min & max range.
        // 4 in [0, 3.8] => 3.8 => 4 (toFixed)
        if (!isInRange(updateValue)) {
          updateValue = (0, _miniDecimal.default)((0, _miniDecimal.toFixed)(numStr, '.', mergedPrecision, true));
        }
      }

      // Trigger event
      if (!updateValue.equals(decimalValue)) {
        setUncontrolledDecimalValue(updateValue);
        onChange === null || onChange === void 0 ? void 0 : onChange(updateValue.isEmpty() ? null : getDecimalValue(stringMode, updateValue));

        // Reformat input if value is not controlled
        if (value === undefined) {
          setInputValue(updateValue, userTyping);
        }
      }
      return updateValue;
    }
    return decimalValue;
  };

  // ========================== User Input ==========================
  var onNextPromise = (0, _useFrame.default)();

  // >>> Collect input value
  var collectInputValue = function collectInputValue(inputStr) {
    recordCursor();

    // Update inputValue incase input can not parse as number
    setInternalInputValue(inputStr);

    // Parse number
    if (!compositionRef.current) {
      var finalValue = mergedParser(inputStr);
      var finalDecimal = (0, _miniDecimal.default)(finalValue);
      if (!finalDecimal.isNaN()) {
        triggerValueUpdate(finalDecimal, true);
      }
    }

    // Trigger onInput later to let user customize value if they want do handle something after onChange
    onInput === null || onInput === void 0 ? void 0 : onInput(inputStr);

    // optimize for chinese input experience
    // https://github.com/ant-design/ant-design/issues/8196
    onNextPromise(function () {
      var nextInputStr = inputStr;
      if (!parser) {
        nextInputStr = inputStr.replace(/。/g, '.');
      }
      if (nextInputStr !== inputStr) {
        collectInputValue(nextInputStr);
      }
    });
  };

  // >>> Composition
  var onCompositionStart = function onCompositionStart() {
    compositionRef.current = true;
  };
  var onCompositionEnd = function onCompositionEnd() {
    compositionRef.current = false;
    collectInputValue(inputRef.current.value);
  };

  // >>> Input
  var onInternalInput = function onInternalInput(e) {
    collectInputValue(e.target.value);
  };

  // ============================= Step =============================
  var onInternalStep = function onInternalStep(up) {
    var _inputRef$current;
    // Ignore step since out of range
    if (up && upDisabled || !up && downDisabled) {
      return;
    }

    // Clear typing status since it may caused by up & down key.
    // We should sync with input value.
    userTypingRef.current = false;
    var stepDecimal = (0, _miniDecimal.default)(shiftKeyRef.current ? (0, _numberUtil.getDecupleSteps)(step) : step);
    if (!up) {
      stepDecimal = stepDecimal.negate();
    }
    var target = (decimalValue || (0, _miniDecimal.default)(0)).add(stepDecimal.toString());
    var updatedValue = triggerValueUpdate(target, false);
    onStep === null || onStep === void 0 ? void 0 : onStep(getDecimalValue(stringMode, updatedValue), {
      offset: shiftKeyRef.current ? (0, _numberUtil.getDecupleSteps)(step) : step,
      type: up ? 'up' : 'down'
    });
    (_inputRef$current = inputRef.current) === null || _inputRef$current === void 0 ? void 0 : _inputRef$current.focus();
  };

  // ============================ Flush =============================
  /**
   * Flush current input content to trigger value change & re-formatter input if needed
   */
  var flushInputValue = function flushInputValue(userTyping) {
    var parsedValue = (0, _miniDecimal.default)(mergedParser(inputValue));
    var formatValue = parsedValue;
    if (!parsedValue.isNaN()) {
      // Only validate value or empty value can be re-fill to inputValue
      // Reassign the formatValue within ranged of trigger control
      formatValue = triggerValueUpdate(parsedValue, userTyping);
    } else {
      formatValue = decimalValue;
    }
    if (value !== undefined) {
      // Reset back with controlled value first
      setInputValue(decimalValue, false);
    } else if (!formatValue.isNaN()) {
      // Reset input back since no validate value
      setInputValue(formatValue, false);
    }
  };

  // Solve the issue of the event triggering sequence when entering numbers in chinese input (Safari)
  var onBeforeInput = function onBeforeInput() {
    userTypingRef.current = true;
  };
  var onKeyDown = function onKeyDown(event) {
    var which = event.which,
      shiftKey = event.shiftKey;
    userTypingRef.current = true;
    if (shiftKey) {
      shiftKeyRef.current = true;
    } else {
      shiftKeyRef.current = false;
    }
    if (which === _KeyCode.default.ENTER) {
      if (!compositionRef.current) {
        userTypingRef.current = false;
      }
      flushInputValue(false);
      onPressEnter === null || onPressEnter === void 0 ? void 0 : onPressEnter(event);
    }
    if (keyboard === false) {
      return;
    }

    // Do step
    if (!compositionRef.current && [_KeyCode.default.UP, _KeyCode.default.DOWN].includes(which)) {
      onInternalStep(_KeyCode.default.UP === which);
      event.preventDefault();
    }
  };
  var onKeyUp = function onKeyUp() {
    userTypingRef.current = false;
    shiftKeyRef.current = false;
  };

  // >>> Focus & Blur
  var onBlur = function onBlur() {
    flushInputValue(false);
    setFocus(false);
    userTypingRef.current = false;
  };

  // ========================== Controlled ==========================
  // Input by precision
  (0, _useLayoutEffect.useLayoutUpdateEffect)(function () {
    if (!decimalValue.isInvalidate()) {
      setInputValue(decimalValue, false);
    }
  }, [precision]);

  // Input by value
  (0, _useLayoutEffect.useLayoutUpdateEffect)(function () {
    var newValue = (0, _miniDecimal.default)(value);
    setDecimalValue(newValue);
    var currentParsedValue = (0, _miniDecimal.default)(mergedParser(inputValue));

    // When user typing from `1.2` to `1.`, we should not convert to `1` immediately.
    // But let it go if user set `formatter`
    if (!newValue.equals(currentParsedValue) || !userTypingRef.current || formatter) {
      // Update value as effect
      setInputValue(newValue, userTypingRef.current);
    }
  }, [value]);

  // ============================ Cursor ============================
  (0, _useLayoutEffect.useLayoutUpdateEffect)(function () {
    if (formatter) {
      restoreCursor();
    }
  }, [inputValue]);

  // ============================ Render ============================
  return /*#__PURE__*/React.createElement("div", {
    className: (0, _classnames.default)(prefixCls, className, (_classNames = {}, (0, _defineProperty2.default)(_classNames, "".concat(prefixCls, "-focused"), focus), (0, _defineProperty2.default)(_classNames, "".concat(prefixCls, "-disabled"), disabled), (0, _defineProperty2.default)(_classNames, "".concat(prefixCls, "-readonly"), readOnly), (0, _defineProperty2.default)(_classNames, "".concat(prefixCls, "-not-a-number"), decimalValue.isNaN()), (0, _defineProperty2.default)(_classNames, "".concat(prefixCls, "-out-of-range"), !decimalValue.isInvalidate() && !isInRange(decimalValue)), _classNames)),
    style: style,
    onFocus: function onFocus() {
      setFocus(true);
    },
    onBlur: onBlur,
    onKeyDown: onKeyDown,
    onKeyUp: onKeyUp,
    onCompositionStart: onCompositionStart,
    onCompositionEnd: onCompositionEnd,
    onBeforeInput: onBeforeInput
  }, controls && /*#__PURE__*/React.createElement(_StepHandler.default, {
    prefixCls: prefixCls,
    upNode: upHandler,
    downNode: downHandler,
    upDisabled: upDisabled,
    downDisabled: downDisabled,
    onStep: onInternalStep
  }), /*#__PURE__*/React.createElement("div", {
    className: "".concat(inputClassName, "-wrap")
  }, /*#__PURE__*/React.createElement("input", (0, _extends2.default)({
    autoComplete: "off",
    role: "spinbutton",
    "aria-valuemin": min,
    "aria-valuemax": max,
    "aria-valuenow": decimalValue.isInvalidate() ? null : decimalValue.toString(),
    step: step
  }, inputProps, {
    ref: (0, _ref.composeRef)(inputRef, ref),
    className: inputClassName,
    value: inputValue,
    onChange: onInternalInput,
    disabled: disabled,
    readOnly: readOnly
  }))));
});
InputNumber.displayName = 'InputNumber';
var _default = InputNumber;
exports.default = _default;