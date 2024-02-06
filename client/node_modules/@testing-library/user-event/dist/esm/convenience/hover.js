import '../utils/click/isClickableInput.js';
import '../utils/dataTransfer/Clipboard.js';
import '../utils/edit/isEditable.js';
import '../utils/edit/maxLength.js';
import '../utils/keyDef/readNextDescriptor.js';
import '../utils/misc/level.js';
import { assertPointerEvents } from '../utils/pointer/cssPointerEvents.js';

async function hover(element) {
    return this.pointer({
        target: element
    });
}
async function unhover(element) {
    assertPointerEvents(this, this.system.pointer.getMouseTarget(this));
    return this.pointer({
        target: element.ownerDocument.body
    });
}

export { hover, unhover };
