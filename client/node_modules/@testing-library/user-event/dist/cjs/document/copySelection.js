'use strict';

require('../utils/click/isClickableInput.js');
var DataTransfer = require('../utils/dataTransfer/DataTransfer.js');
require('../utils/dataTransfer/Clipboard.js');
require('../utils/edit/isEditable.js');
require('../utils/edit/maxLength.js');
var getWindow = require('../utils/misc/getWindow.js');
var selection = require('../utils/focus/selection.js');
require('../utils/keyDef/readNextDescriptor.js');
require('../utils/misc/level.js');
require('../options.js');
var UI = require('./UI.js');

function copySelection(target) {
    const data = selection.hasOwnSelection(target) ? {
        'text/plain': readSelectedValueFromInput(target)
    } : {
        'text/plain': String(target.ownerDocument.getSelection())
    };
    const dt = DataTransfer.createDataTransfer(getWindow.getWindow(target));
    for(const type in data){
        if (data[type]) {
            dt.setData(type, data[type]);
        }
    }
    return dt;
}
function readSelectedValueFromInput(target) {
    const sel = UI.getUISelection(target);
    const val = UI.getUIValue(target);
    return val.substring(sel.startOffset, sel.endOffset);
}

exports.copySelection = copySelection;
