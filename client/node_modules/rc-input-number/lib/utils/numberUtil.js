"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getDecupleSteps = getDecupleSteps;
var _miniDecimal = require("@rc-component/mini-decimal");
function getDecupleSteps(step) {
  var stepStr = typeof step === 'number' ? (0, _miniDecimal.num2str)(step) : (0, _miniDecimal.trimNumber)(step).fullStr;
  var hasPoint = stepStr.includes('.');
  if (!hasPoint) {
    return step + '0';
  }
  return (0, _miniDecimal.trimNumber)(stepStr.replace(/(\d)\.(\d)/g, '$1$2.')).fullStr;
}