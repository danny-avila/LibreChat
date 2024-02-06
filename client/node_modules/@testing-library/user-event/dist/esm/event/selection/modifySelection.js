import { setUISelection } from '../../document/UI.js';
import '../../utils/click/isClickableInput.js';
import '../../utils/dataTransfer/Clipboard.js';
import '../../utils/edit/isEditable.js';
import '../../utils/edit/maxLength.js';
import '../../utils/keyDef/readNextDescriptor.js';
import '../../utils/misc/level.js';
import '../../options.js';
import { getTargetTypeAndSelection } from './getTargetTypeAndSelection.js';

/**
 * Extend/shrink the selection like with Shift+Arrows or Shift+Mouse
 */ function modifySelection({ focusNode, focusOffset }) {
    var _focusNode_ownerDocument_getSelection, _focusNode_ownerDocument;
    const typeAndSelection = getTargetTypeAndSelection(focusNode);
    if (typeAndSelection.type === 'input') {
        return setUISelection(focusNode, {
            anchorOffset: typeAndSelection.selection.anchorOffset,
            focusOffset
        }, 'modify');
    }
    (_focusNode_ownerDocument = focusNode.ownerDocument) === null || _focusNode_ownerDocument === void 0 ? void 0 : (_focusNode_ownerDocument_getSelection = _focusNode_ownerDocument.getSelection()) === null || _focusNode_ownerDocument_getSelection === void 0 ? void 0 : _focusNode_ownerDocument_getSelection.extend(focusNode, focusOffset);
}

export { modifySelection };
