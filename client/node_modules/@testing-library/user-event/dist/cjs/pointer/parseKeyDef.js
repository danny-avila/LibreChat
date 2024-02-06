'use strict';

require('../utils/click/isClickableInput.js');
require('../utils/dataTransfer/Clipboard.js');
require('../utils/edit/isEditable.js');
require('../utils/edit/maxLength.js');
var readNextDescriptor = require('../utils/keyDef/readNextDescriptor.js');
require('../utils/misc/level.js');
require('../options.js');

function parseKeyDef(pointerMap, keys) {
    const defs = [];
    do {
        const { descriptor, consumedLength, releasePrevious, releaseSelf = true } = readNextDescriptor.readNextDescriptor(keys, 'pointer');
        const keyDef = pointerMap.find((p)=>p.name === descriptor);
        if (keyDef) {
            defs.push({
                keyDef,
                releasePrevious,
                releaseSelf
            });
        }
        keys = keys.slice(consumedLength);
    }while (keys)
    return defs;
}

exports.parseKeyDef = parseKeyDef;
