import _toConsumableArray from "@babel/runtime/helpers/esm/toConsumableArray";
import isVisible from "./isVisible";
function focusable(node) {
  var includePositive = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
  if (isVisible(node)) {
    var nodeName = node.nodeName.toLowerCase();
    var isFocusableElement =
    // Focusable element
    ['input', 'select', 'textarea', 'button'].includes(nodeName) ||
    // Editable element
    node.isContentEditable ||
    // Anchor with href element
    nodeName === 'a' && !!node.getAttribute('href');

    // Get tabIndex
    var tabIndexAttr = node.getAttribute('tabindex');
    var tabIndexNum = Number(tabIndexAttr);

    // Parse as number if validate
    var tabIndex = null;
    if (tabIndexAttr && !Number.isNaN(tabIndexNum)) {
      tabIndex = tabIndexNum;
    } else if (isFocusableElement && tabIndex === null) {
      tabIndex = 0;
    }

    // Block focusable if disabled
    if (isFocusableElement && node.disabled) {
      tabIndex = null;
    }
    return tabIndex !== null && (tabIndex >= 0 || includePositive && tabIndex < 0);
  }
  return false;
}
export function getFocusNodeList(node) {
  var includePositive = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
  var res = _toConsumableArray(node.querySelectorAll('*')).filter(function (child) {
    return focusable(child, includePositive);
  });
  if (focusable(node, includePositive)) {
    res.unshift(node);
  }
  return res;
}
var lastFocusElement = null;

/** @deprecated Do not use since this may failed when used in async */
export function saveLastFocusNode() {
  lastFocusElement = document.activeElement;
}

/** @deprecated Do not use since this may failed when used in async */
export function clearLastFocusNode() {
  lastFocusElement = null;
}

/** @deprecated Do not use since this may failed when used in async */
export function backLastFocusNode() {
  if (lastFocusElement) {
    try {
      // 元素可能已经被移动了
      lastFocusElement.focus();

      /* eslint-disable no-empty */
    } catch (e) {
      // empty
    }
    /* eslint-enable no-empty */
  }
}

export function limitTabRange(node, e) {
  if (e.keyCode === 9) {
    var tabNodeList = getFocusNodeList(node);
    var lastTabNode = tabNodeList[e.shiftKey ? 0 : tabNodeList.length - 1];
    var leavingTab = lastTabNode === document.activeElement || node === document.activeElement;
    if (leavingTab) {
      var target = tabNodeList[e.shiftKey ? tabNodeList.length - 1 : 0];
      target.focus();
      e.preventDefault();
    }
  }
}