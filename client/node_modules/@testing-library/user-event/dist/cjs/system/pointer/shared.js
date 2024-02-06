'use strict';

function isDifferentPointerPosition(positionA, positionB) {
    var _positionA_coords, _positionB_coords, _positionA_coords1, _positionB_coords1, _positionA_caret, _positionB_caret, _positionA_caret1, _positionB_caret1;
    return positionA.target !== positionB.target || ((_positionA_coords = positionA.coords) === null || _positionA_coords === void 0 ? void 0 : _positionA_coords.x) !== ((_positionB_coords = positionB.coords) === null || _positionB_coords === void 0 ? void 0 : _positionB_coords.y) || ((_positionA_coords1 = positionA.coords) === null || _positionA_coords1 === void 0 ? void 0 : _positionA_coords1.y) !== ((_positionB_coords1 = positionB.coords) === null || _positionB_coords1 === void 0 ? void 0 : _positionB_coords1.y) || ((_positionA_caret = positionA.caret) === null || _positionA_caret === void 0 ? void 0 : _positionA_caret.node) !== ((_positionB_caret = positionB.caret) === null || _positionB_caret === void 0 ? void 0 : _positionB_caret.node) || ((_positionA_caret1 = positionA.caret) === null || _positionA_caret1 === void 0 ? void 0 : _positionA_caret1.offset) !== ((_positionB_caret1 = positionB.caret) === null || _positionB_caret1 === void 0 ? void 0 : _positionB_caret1.offset);
}

exports.isDifferentPointerPosition = isDifferentPointerPosition;
