'use strict';

exports.ApiLevel = void 0;
(function(ApiLevel) {
    ApiLevel[ApiLevel["Trigger"] = 2] = "Trigger";
    ApiLevel[ApiLevel["Call"] = 1] = "Call";
})(exports.ApiLevel || (exports.ApiLevel = {}));
function setLevelRef(instance, level) {
    instance.levelRefs[level] = {};
}
function getLevelRef(instance, level) {
    return instance.levelRefs[level];
}

exports.getLevelRef = getLevelRef;
exports.setLevelRef = setLevelRef;
