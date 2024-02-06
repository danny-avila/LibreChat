"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = useCursor;
var _react = require("react");
var _warning = _interopRequireDefault(require("rc-util/lib/warning"));
/**
 * Keep input cursor in the correct position if possible.
 * Is this necessary since we have `formatter` which may mass the content?
 */
function useCursor(input, focused) {
  var selectionRef = (0, _react.useRef)(null);
  function recordCursor() {
    // Record position
    try {
      var start = input.selectionStart,
        end = input.selectionEnd,
        value = input.value;
      var beforeTxt = value.substring(0, start);
      var afterTxt = value.substring(end);
      selectionRef.current = {
        start: start,
        end: end,
        value: value,
        beforeTxt: beforeTxt,
        afterTxt: afterTxt
      };
    } catch (e) {
      // Fix error in Chrome:
      // Failed to read the 'selectionStart' property from 'HTMLInputElement'
      // http://stackoverflow.com/q/21177489/3040605
    }
  }

  /**
   * Restore logic:
   *  1. back string same
   *  2. start string same
   */
  function restoreCursor() {
    if (input && selectionRef.current && focused) {
      try {
        var value = input.value;
        var _selectionRef$current = selectionRef.current,
          beforeTxt = _selectionRef$current.beforeTxt,
          afterTxt = _selectionRef$current.afterTxt,
          start = _selectionRef$current.start;
        var startPos = value.length;
        if (value.endsWith(afterTxt)) {
          startPos = value.length - selectionRef.current.afterTxt.length;
        } else if (value.startsWith(beforeTxt)) {
          startPos = beforeTxt.length;
        } else {
          var beforeLastChar = beforeTxt[start - 1];
          var newIndex = value.indexOf(beforeLastChar, start - 1);
          if (newIndex !== -1) {
            startPos = newIndex + 1;
          }
        }
        input.setSelectionRange(startPos, startPos);
      } catch (e) {
        (0, _warning.default)(false, "Something warning of cursor restore. Please fire issue about this: ".concat(e.message));
      }
    }
  }
  return [recordCursor, restoreCursor];
}