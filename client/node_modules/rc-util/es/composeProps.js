import _objectSpread from "@babel/runtime/helpers/esm/objectSpread2";
function composeProps(originProps, patchProps, isAll) {
  var composedProps = _objectSpread(_objectSpread({}, originProps), isAll ? patchProps : {});
  Object.keys(patchProps).forEach(function (key) {
    var func = patchProps[key];
    if (typeof func === 'function') {
      composedProps[key] = function () {
        var _originProps$key;
        for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
          args[_key] = arguments[_key];
        }
        func.apply(void 0, args);
        return (_originProps$key = originProps[key]) === null || _originProps$key === void 0 ? void 0 : _originProps$key.call.apply(_originProps$key, [originProps].concat(args));
      };
    }
  });
  return composedProps;
}
export default composeProps;