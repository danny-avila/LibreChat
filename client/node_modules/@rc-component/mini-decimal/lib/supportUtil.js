"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.supportBigInt = supportBigInt;
function supportBigInt() {
  return typeof BigInt === 'function';
}