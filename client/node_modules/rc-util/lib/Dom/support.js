"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.transition = exports.animation = void 0;
var _canUseDom = _interopRequireDefault(require("./canUseDom"));
var animationEndEventNames = {
  WebkitAnimation: 'webkitAnimationEnd',
  OAnimation: 'oAnimationEnd',
  animation: 'animationend'
};
var transitionEventNames = {
  WebkitTransition: 'webkitTransitionEnd',
  OTransition: 'oTransitionEnd',
  transition: 'transitionend'
};
function supportEnd(names) {
  var el = document.createElement('div');
  for (var name in names) {
    if (names.hasOwnProperty(name) && el.style[name] !== undefined) {
      return {
        end: names[name]
      };
    }
  }
  return false;
}
var animation = exports.animation = (0, _canUseDom.default)() && supportEnd(animationEndEventNames);
var transition = exports.transition = (0, _canUseDom.default)() && supportEnd(transitionEventNames);