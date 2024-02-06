import _defineProperty from "@babel/runtime/helpers/esm/defineProperty";
import _objectSpread from "@babel/runtime/helpers/esm/objectSpread2";
/* eslint-disable no-param-reassign */
var NO_EXIST = {
  __NOT_EXIST: true
};
export function spyElementPrototypes(elementClass, properties) {
  var propNames = Object.keys(properties);
  var originDescriptors = {};
  propNames.forEach(function (propName) {
    var originDescriptor = Object.getOwnPropertyDescriptor(elementClass.prototype, propName);
    originDescriptors[propName] = originDescriptor || NO_EXIST;
    var spyProp = properties[propName];
    if (typeof spyProp === 'function') {
      // If is a function
      elementClass.prototype[propName] = function spyFunc() {
        for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
          args[_key] = arguments[_key];
        }
        return spyProp.call.apply(spyProp, [this, originDescriptor].concat(args));
      };
    } else {
      // Otherwise tread as a property
      Object.defineProperty(elementClass.prototype, propName, _objectSpread(_objectSpread({}, spyProp), {}, {
        set: function set(value) {
          if (spyProp.set) {
            return spyProp.set.call(this, originDescriptor, value);
          }
          return originDescriptor.set(value);
        },
        get: function get() {
          if (spyProp.get) {
            return spyProp.get.call(this, originDescriptor);
          }
          return originDescriptor.get();
        },
        configurable: true
      }));
    }
  });
  return {
    mockRestore: function mockRestore() {
      propNames.forEach(function (propName) {
        var originDescriptor = originDescriptors[propName];
        if (originDescriptor === NO_EXIST) {
          delete elementClass.prototype[propName];
        } else if (typeof originDescriptor === 'function') {
          elementClass.prototype[propName] = originDescriptor;
        } else {
          Object.defineProperty(elementClass.prototype, propName, originDescriptor);
        }
      });
    }
  };
}
export function spyElementPrototype(Element, propName, property) {
  return spyElementPrototypes(Element, _defineProperty({}, propName, property));
}
/* eslint-enable */