'use strict';

var UI = require('../../document/UI.js');
require('../../utils/click/isClickableInput.js');
require('../../utils/dataTransfer/Clipboard.js');
require('../../utils/edit/isEditable.js');
require('../../utils/edit/maxLength.js');
require('../../utils/keyDef/readNextDescriptor.js');
require('../../utils/misc/level.js');
require('../../options.js');
var getTargetTypeAndSelection = require('./getTargetTypeAndSelection.js');

/**
 * Extend/shrink the selection like with Shift+Arrows or Shift+Mouse
 */ function modifySelection({ focusNode, focusOffset }) {
    var _focusNode_ownerDocument_getSelection, _focusNode_ownerDocument;
    const typeAndSelection = getTargetTypeAndSelection.getTargetTypeAndSelection(focusNode);
    if (typeAndSelection.type === 'input') {
        return UI.setUISelection(focusNode, {
            anchorOffset: typeAndSelection.selection.anchorOffset,
            focusOffset
        }, 'modify');
    }
    (_focusNode_ownerDocument = focusNode.ownerDocument) === null || _focusNode_ownerDocument === void 0 ? void 0 : (_focusNode_ownerDocument_getSelection = _focusNode_ownerDocument.getSelection()) === null || _focusNode_ownerDocument_getSelection === void 0 ? void 0 : _focusNode_ownerDocument_getSelection.extend(focusNode, focusOffset);
}

exports.modifySelection = modifySelection;
