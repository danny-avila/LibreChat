'use strict';

var UI = require('../../document/UI.js');
require('../../utils/click/isClickableInput.js');
require('../../utils/dataTransfer/Clipboard.js');
require('../../utils/edit/isEditable.js');
require('../../utils/edit/maxLength.js');
var cursor = require('../../utils/focus/cursor.js');
var selection = require('../../utils/focus/selection.js');
require('../../utils/keyDef/readNextDescriptor.js');
require('../../utils/misc/level.js');
require('../../options.js');
var setSelection = require('./setSelection.js');

/**
 * Move the selection
 */ function moveSelection(node, direction) {
    // TODO: implement shift
    if (selection.hasOwnSelection(node)) {
        const selection = UI.getUISelection(node);
        setSelection.setSelection({
            focusNode: node,
            focusOffset: selection.startOffset === selection.endOffset ? selection.focusOffset + direction : direction < 0 ? selection.startOffset : selection.endOffset
        });
    } else {
        const selection = node.ownerDocument.getSelection();
        if (!(selection === null || selection === void 0 ? void 0 : selection.focusNode)) {
            return;
        }
        if (selection.isCollapsed) {
            const nextPosition = cursor.getNextCursorPosition(selection.focusNode, selection.focusOffset, direction);
            if (nextPosition) {
                setSelection.setSelection({
                    focusNode: nextPosition.node,
                    focusOffset: nextPosition.offset
                });
            }
        } else {
            selection[direction < 0 ? 'collapseToStart' : 'collapseToEnd']();
        }
    }
}

exports.moveSelection = moveSelection;
