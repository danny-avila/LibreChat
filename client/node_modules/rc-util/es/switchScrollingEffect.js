import getScrollBarSize from "./getScrollBarSize";
import setStyle from "./setStyle";
function isBodyOverflowing() {
  return document.body.scrollHeight > (window.innerHeight || document.documentElement.clientHeight) && window.innerWidth > document.body.offsetWidth;
}
var cacheStyle = {};
export default (function (close) {
  if (!isBodyOverflowing() && !close) {
    return;
  }

  // https://github.com/ant-design/ant-design/issues/19729
  var scrollingEffectClassName = 'ant-scrolling-effect';
  var scrollingEffectClassNameReg = new RegExp("".concat(scrollingEffectClassName), 'g');
  var bodyClassName = document.body.className;
  if (close) {
    if (!scrollingEffectClassNameReg.test(bodyClassName)) return;
    setStyle(cacheStyle);
    cacheStyle = {};
    document.body.className = bodyClassName.replace(scrollingEffectClassNameReg, '').trim();
    return;
  }
  var scrollBarSize = getScrollBarSize();
  if (scrollBarSize) {
    cacheStyle = setStyle({
      position: 'relative',
      width: "calc(100% - ".concat(scrollBarSize, "px)")
    });
    if (!scrollingEffectClassNameReg.test(bodyClassName)) {
      var addClassName = "".concat(bodyClassName, " ").concat(scrollingEffectClassName);
      document.body.className = addClassName.trim();
    }
  }
});