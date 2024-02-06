import '../utils/click/isClickableInput.js';
import { createDataTransfer } from '../utils/dataTransfer/DataTransfer.js';
import '../utils/dataTransfer/Clipboard.js';
import '../utils/edit/isEditable.js';
import '../utils/edit/maxLength.js';
import { getWindow } from '../utils/misc/getWindow.js';
import { hasOwnSelection } from '../utils/focus/selection.js';
import '../utils/keyDef/readNextDescriptor.js';
import '../utils/misc/level.js';
import '../options.js';
import { getUISelection, getUIValue } from './UI.js';

function copySelection(target) {
    const data = hasOwnSelection(target) ? {
        'text/plain': readSelectedValueFromInput(target)
    } : {
        'text/plain': String(target.ownerDocument.getSelection())
    };
    const dt = createDataTransfer(getWindow(target));
    for(const type in data){
        if (data[type]) {
            dt.setData(type, data[type]);
        }
    }
    return dt;
}
function readSelectedValueFromInput(target) {
    const sel = getUISelection(target);
    const val = getUIValue(target);
    return val.substring(sel.startOffset, sel.endOffset);
}

export { copySelection };
