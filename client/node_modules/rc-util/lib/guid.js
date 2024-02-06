"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = guid;
var seed = 0;
function guid() {
  return "".concat(Date.now(), "_").concat(seed++);
}