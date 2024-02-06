import canUseDOM from "./canUseDom";
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
export var animation = canUseDOM() && supportEnd(animationEndEventNames);
export var transition = canUseDOM() && supportEnd(transitionEventNames);