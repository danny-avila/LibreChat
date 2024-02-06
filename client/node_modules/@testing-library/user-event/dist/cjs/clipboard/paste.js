'use strict';

require('../utils/click/isClickableInput.js');
var DataTransfer = require('../utils/dataTransfer/DataTransfer.js');
var Clipboard = require('../utils/dataTransfer/Clipboard.js');
require('../utils/edit/isEditable.js');
require('../utils/edit/maxLength.js');
var getWindow = require('../utils/misc/getWindow.js');
require('../utils/keyDef/readNextDescriptor.js');
require('../utils/misc/level.js');
require('../options.js');

async function paste(clipboardData) {
    const doc = this.config.document;
    var _doc_activeElement;
    const target = (_doc_activeElement = doc.activeElement) !== null && _doc_activeElement !== void 0 ? _doc_activeElement : /* istanbul ignore next */ doc.body;
    var _ref;
    const dataTransfer = (_ref = typeof clipboardData === 'string' ? getClipboardDataFromString(doc, clipboardData) : clipboardData) !== null && _ref !== void 0 ? _ref : await Clipboard.readDataTransferFromClipboard(doc).catch(()=>{
        throw new Error('`userEvent.paste()` without `clipboardData` requires the `ClipboardAPI` to be available.');
    });
    this.dispatchUIEvent(target, 'paste', {
        clipboardData: dataTransfer
    });
}
function getClipboardDataFromString(doc, text) {
    const dt = DataTransfer.createDataTransfer(getWindow.getWindow(doc));
    dt.setData('text', text);
    return dt;
}

exports.paste = paste;
