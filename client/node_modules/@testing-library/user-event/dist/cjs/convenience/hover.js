'use strict';

require('../utils/click/isClickableInput.js');
require('../utils/dataTransfer/Clipboard.js');
require('../utils/edit/isEditable.js');
require('../utils/edit/maxLength.js');
require('../utils/keyDef/readNextDescriptor.js');
require('../utils/misc/level.js');
var cssPointerEvents = require('../utils/pointer/cssPointerEvents.js');

async function hover(element) {
    return this.pointer({
        target: element
    });
}
async function unhover(element) {
    cssPointerEvents.assertPointerEvents(this, this.system.pointer.getMouseTarget(this));
    return this.pointer({
        target: element.ownerDocument.body
    });
}

exports.hover = hover;
exports.unhover = unhover;
