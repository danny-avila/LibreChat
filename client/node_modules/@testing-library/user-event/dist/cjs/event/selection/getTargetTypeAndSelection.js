'use strict';

var UI = require('../../document/UI.js');
require('../../utils/click/isClickableInput.js');
require('../../utils/dataTransfer/Clipboard.js');
var isContentEditable = require('../../utils/edit/isContentEditable.js');
require('../../utils/edit/isEditable.js');
require('../../utils/edit/maxLength.js');
var selection = require('../../utils/focus/selection.js');
require('../../utils/keyDef/readNextDescriptor.js');
require('../../utils/misc/level.js');
require('../../options.js');

/**
 * Determine which selection logic and selection ranges to consider.
 */ function getTargetTypeAndSelection(node) {
    const element = getElement(node);
    if (element && selection.hasOwnSelection(element)) {
        return {
            type: 'input',
            selection: UI.getUISelection(element)
        };
    }
    const selection$1 = element === null || element === void 0 ? void 0 : element.ownerDocument.getSelection();
    // It is possible to extend a single-range selection into a contenteditable.
    // This results in the range acting like a range outside of contenteditable.
    const isCE = isContentEditable.getContentEditable(node) && (selection$1 === null || selection$1 === void 0 ? void 0 : selection$1.anchorNode) && isContentEditable.getContentEditable(selection$1.anchorNode);
    return {
        type: isCE ? 'contenteditable' : 'default',
        selection: selection$1
    };
}
function getElement(node) {
    return node.nodeType === 1 ? node : node.parentElement;
}

exports.getTargetTypeAndSelection = getTargetTypeAndSelection;
