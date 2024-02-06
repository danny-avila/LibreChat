'use strict';

var index = require('../keyboard/index.js');
require('../utils/click/isClickableInput.js');
require('../utils/dataTransfer/Clipboard.js');
require('../utils/edit/isEditable.js');
require('../utils/edit/maxLength.js');
require('../utils/keyDef/readNextDescriptor.js');
require('../utils/misc/level.js');
require('../options.js');
var setSelectionRange = require('../event/selection/setSelectionRange.js');

async function type(element, text, { skipClick = this.config.skipClick, skipAutoClose = this.config.skipAutoClose, initialSelectionStart, initialSelectionEnd } = {}) {
    // TODO: properly type guard
    // we use this workaround for now to prevent changing behavior
    if (element.disabled) return;
    if (!skipClick) {
        await this.click(element);
    }
    if (initialSelectionStart !== undefined) {
        setSelectionRange.setSelectionRange(element, initialSelectionStart, initialSelectionEnd !== null && initialSelectionEnd !== void 0 ? initialSelectionEnd : initialSelectionStart);
    }
    await this.keyboard(text);
    if (!skipAutoClose) {
        await index.releaseAllKeys(this);
    }
}

exports.type = type;
