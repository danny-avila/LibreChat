import _typeof from "@babel/runtime/helpers/esm/typeof";
import _toConsumableArray from "@babel/runtime/helpers/esm/toConsumableArray";
import _objectSpread from "@babel/runtime/helpers/esm/objectSpread2";
/* eslint no-proto: 0 */

function createArray() {
  var arr = [];
  arr.__proto__ = new Array();
  arr.__proto__.format = function toString() {
    return this.map(function (obj) {
      return _objectSpread(_objectSpread({}, obj), {}, {
        path: obj.path.join(' > ')
      });
    });
  };
  arr.__proto__.toString = function toString() {
    return JSON.stringify(this.format(), null, 2);
  };
  return arr;
}
export default function diff(obj1, obj2) {
  var depth = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 10;
  var path = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : [];
  var diffList = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : createArray();
  if (depth <= 0) return diffList;
  var keys = new Set([].concat(_toConsumableArray(Object.keys(obj1)), _toConsumableArray(Object.keys(obj2))));
  keys.forEach(function (key) {
    var value1 = obj1[key];
    var value2 = obj2[key];

    // Same value
    if (value1 === value2) return;
    var type1 = _typeof(value1);
    var type2 = _typeof(value2);

    // Diff type
    if (type1 !== type2) {
      diffList.push({
        path: path.concat(key),
        value1: value1,
        value2: value2
      });
      return;
    }

    // NaN
    if (Number.isNaN(value1) && Number.isNaN(value2)) {
      return;
    }

    // Object & Array
    if (type1 === 'object' && value1 !== null && value2 !== null) {
      diff(value1, value2, depth - 1, path.concat(key), diffList);
      return;
    }

    // Rest
    diffList.push({
      path: path.concat(key),
      value1: value1,
      value2: value2
    });
  });
  return diffList;
}