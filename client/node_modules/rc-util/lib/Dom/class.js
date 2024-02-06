"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.addClass = addClass;
exports.hasClass = hasClass;
exports.removeClass = removeClass;
function hasClass(node, className) {
  if (node.classList) {
    return node.classList.contains(className);
  }
  var originClass = node.className;
  return " ".concat(originClass, " ").indexOf(" ".concat(className, " ")) > -1;
}
function addClass(node, className) {
  if (node.classList) {
    node.classList.add(className);
  } else {
    if (!hasClass(node, className)) {
      node.className = "".concat(node.className, " ").concat(className);
    }
  }
}
function removeClass(node, className) {
  if (node.classList) {
    node.classList.remove(className);
  } else {
    if (hasClass(node, className)) {
      var originClass = node.className;
      node.className = " ".concat(originClass, " ").replace(" ".concat(className, " "), ' ');
    }
  }
}