"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _encryption = _interopRequireDefault(require("./encryption"));

var _utils = require("./utils");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _unsupportedIterableToArray(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }

function _unsupportedIterableToArray(o, minLen) { if (!o) return; if (typeof o === "string") return _arrayLikeToArray(o, minLen); var n = Object.prototype.toString.call(o).slice(8, -1); if (n === "Object" && o.constructor) n = o.constructor.name; if (n === "Map" || n === "Set") return Array.from(o); if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen); }

function _arrayLikeToArray(arr, len) { if (len == null || len > arr.length) len = arr.length; for (var i = 0, arr2 = new Array(len); i < len; i++) { arr2[i] = arr[i]; } return arr2; }

function _iterableToArrayLimit(arr, i) { var _i = arr == null ? null : typeof Symbol !== "undefined" && arr[Symbol.iterator] || arr["@@iterator"]; if (_i == null) return; var _arr = []; var _n = true; var _d = false; var _s, _e; try { for (_i = _i.call(arr); !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

var KEY_PREFIX = (0, _utils.getSecurePrefix)();
/**
 * Function to preload all the local storage data
 * @returns
 */

var getAllLocalStorageItems = function getAllLocalStorageItems() {
  var localStorageItems = {};

  if (typeof window !== "undefined") {
    var encrypt = new _encryption.default();

    for (var _i = 0, _Object$entries = Object.entries(localStorage); _i < _Object$entries.length; _i++) {
      var _Object$entries$_i = _slicedToArray(_Object$entries[_i], 2),
          key = _Object$entries$_i[0],
          value = _Object$entries$_i[1];

      if (key.startsWith(KEY_PREFIX)) {
        var keyType = key.replace(KEY_PREFIX, "")[0];
        var parsedKey = key.replace(/[.][bjns][.]/, ".");
        var decryptedValue = encrypt.decrypt(value);
        var parsedValue = null;
        if (decryptedValue != null) switch (keyType) {
          case "b":
            parsedValue = decryptedValue === "true";
            break;

          case "j":
            try {
              parsedValue = JSON.parse(decryptedValue);
            } catch (ex) {
              parsedValue = null;
            }

            break;

          case "n":
            try {
              parsedValue = Number(decryptedValue);
            } catch (ex) {
              parsedValue = null;
            }

            break;

          default:
            parsedValue = decryptedValue;
        }
        localStorageItems[parsedKey] = parsedValue;
      }
    }
  }

  return localStorageItems;
};

var _default = getAllLocalStorageItems;
exports.default = _default;