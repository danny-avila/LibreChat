import { releaseAllKeys } from '../keyboard/index.js';
import '../utils/click/isClickableInput.js';
import '../utils/dataTransfer/Clipboard.js';
import '../utils/edit/isEditable.js';
import '../utils/edit/maxLength.js';
import '../utils/keyDef/readNextDescriptor.js';
import '../utils/misc/level.js';
import '../options.js';
import { setSelectionRange } from '../event/selection/setSelectionRange.js';

async function type(element, text, { skipClick = this.config.skipClick, skipAutoClose = this.config.skipAutoClose, initialSelectionStart, initialSelectionEnd } = {}) {
    // TODO: properly type guard
    // we use this workaround for now to prevent changing behavior
    if (element.disabled) return;
    if (!skipClick) {
        await this.click(element);
    }
    if (initialSelectionStart !== undefined) {
        setSelectionRange(element, initialSelectionStart, initialSelectionEnd !== null && initialSelectionEnd !== void 0 ? initialSelectionEnd : initialSelectionStart);
    }
    await this.keyboard(text);
    if (!skipAutoClose) {
        await releaseAllKeys(this);
    }
}

export { type };
