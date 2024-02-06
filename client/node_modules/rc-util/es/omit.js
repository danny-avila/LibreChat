import _objectSpread from "@babel/runtime/helpers/esm/objectSpread2";
export default function omit(obj, fields) {
  var clone = _objectSpread({}, obj);
  if (Array.isArray(fields)) {
    fields.forEach(function (key) {
      delete clone[key];
    });
  }
  return clone;
}