import '../../utils/click/isClickableInput.js';
import '../../utils/dataTransfer/Clipboard.js';
import { getContentEditable } from '../../utils/edit/isContentEditable.js';
import '../../utils/edit/isEditable.js';
import '../../utils/edit/maxLength.js';
import { hasOwnSelection } from '../../utils/focus/selection.js';
import '../../utils/keyDef/readNextDescriptor.js';
import '../../utils/misc/level.js';
import '../../options.js';

/**
 * Reset the Document Selection when moving focus into an element
 * with own selection implementation.
 */ function updateSelectionOnFocus(element) {
    const selection = element.ownerDocument.getSelection();
    /* istanbul ignore if */ if (!(selection === null || selection === void 0 ? void 0 : selection.focusNode)) {
        return;
    }
    // If the focus moves inside an element with own selection implementation,
    // the document selection will be this element.
    // But if the focused element is inside a contenteditable,
    // 1) a collapsed selection will be retained.
    // 2) other selections will be replaced by a cursor
    //  2.a) at the start of the first child if it is a text node
    //  2.b) at the start of the contenteditable.
    if (hasOwnSelection(element)) {
        const contenteditable = getContentEditable(selection.focusNode);
        if (contenteditable) {
            if (!selection.isCollapsed) {
                var _contenteditable_firstChild;
                const focusNode = ((_contenteditable_firstChild = contenteditable.firstChild) === null || _contenteditable_firstChild === void 0 ? void 0 : _contenteditable_firstChild.nodeType) === 3 ? contenteditable.firstChild : contenteditable;
                selection.setBaseAndExtent(focusNode, 0, focusNode, 0);
            }
        } else {
            selection.setBaseAndExtent(element, 0, element, 0);
        }
    }
}

export { updateSelectionOnFocus };
