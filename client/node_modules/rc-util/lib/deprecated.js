"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = deprecated;
function deprecated(props, instead, component) {
  if (typeof window !== 'undefined' && window.console && window.console.error) {
    window.console.error("Warning: ".concat(props, " is deprecated at [ ").concat(component, " ], ") + "use [ ".concat(instead, " ] instead of it."));
  }
}