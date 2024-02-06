import '../utils/click/isClickableInput.js';
import '../utils/dataTransfer/Clipboard.js';
import { isContentEditable } from '../utils/edit/isContentEditable.js';
import '../utils/edit/isEditable.js';
import '../utils/edit/maxLength.js';
import '../utils/keyDef/readNextDescriptor.js';
import '../utils/misc/level.js';
import '../options.js';
import { getUIValue } from './UI.js';

function getValueOrTextContent(element) {
    // istanbul ignore if
    if (!element) {
        return null;
    }
    if (isContentEditable(element)) {
        return element.textContent;
    }
    return getUIValue(element);
}

export { getValueOrTextContent };
