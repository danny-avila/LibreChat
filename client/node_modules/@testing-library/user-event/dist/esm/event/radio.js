import '../utils/click/isClickableInput.js';
import '../utils/dataTransfer/Clipboard.js';
import '../utils/edit/isEditable.js';
import '../utils/edit/maxLength.js';
import { isDisabled } from '../utils/misc/isDisabled.js';
import { getWindow } from '../utils/misc/getWindow.js';
import '../utils/keyDef/readNextDescriptor.js';
import '../utils/misc/level.js';
import '../options.js';
import { focusElement } from './focus.js';

function walkRadio(instance, el, direction) {
    const window = getWindow(el);
    const group = Array.from(el.ownerDocument.querySelectorAll(el.name ? `input[type="radio"][name="${window.CSS.escape(el.name)}"]` : `input[type="radio"][name=""], input[type="radio"]:not([name])`));
    for(let i = group.findIndex((e)=>e === el) + direction;; i += direction){
        if (!group[i]) {
            i = direction > 0 ? 0 : group.length - 1;
        }
        if (group[i] === el) {
            return;
        }
        if (isDisabled(group[i])) {
            continue;
        }
        focusElement(group[i]);
        instance.dispatchUIEvent(group[i], 'click');
    }
}

export { walkRadio };
