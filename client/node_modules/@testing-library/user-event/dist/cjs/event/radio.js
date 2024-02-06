'use strict';

require('../utils/click/isClickableInput.js');
require('../utils/dataTransfer/Clipboard.js');
require('../utils/edit/isEditable.js');
require('../utils/edit/maxLength.js');
var isDisabled = require('../utils/misc/isDisabled.js');
var getWindow = require('../utils/misc/getWindow.js');
require('../utils/keyDef/readNextDescriptor.js');
require('../utils/misc/level.js');
require('../options.js');
var focus = require('./focus.js');

function walkRadio(instance, el, direction) {
    const window = getWindow.getWindow(el);
    const group = Array.from(el.ownerDocument.querySelectorAll(el.name ? `input[type="radio"][name="${window.CSS.escape(el.name)}"]` : `input[type="radio"][name=""], input[type="radio"]:not([name])`));
    for(let i = group.findIndex((e)=>e === el) + direction;; i += direction){
        if (!group[i]) {
            i = direction > 0 ? 0 : group.length - 1;
        }
        if (group[i] === el) {
            return;
        }
        if (isDisabled.isDisabled(group[i])) {
            continue;
        }
        focus.focusElement(group[i]);
        instance.dispatchUIEvent(group[i], 'click');
    }
}

exports.walkRadio = walkRadio;
