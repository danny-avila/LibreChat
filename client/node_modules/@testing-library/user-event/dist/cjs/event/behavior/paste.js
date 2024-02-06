'use strict';

require('../../utils/click/isClickableInput.js');
require('../../utils/dataTransfer/Clipboard.js');
var isEditable = require('../../utils/edit/isEditable.js');
require('../../utils/edit/maxLength.js');
require('../../utils/keyDef/readNextDescriptor.js');
require('../../utils/misc/level.js');
require('../../options.js');
var input = require('../input.js');
var registry = require('./registry.js');

registry.behavior.paste = (event, target, instance)=>{
    if (isEditable.isEditable(target)) {
        return ()=>{
            var _event_clipboardData;
            const insertData = (_event_clipboardData = event.clipboardData) === null || _event_clipboardData === void 0 ? void 0 : _event_clipboardData.getData('text');
            if (insertData) {
                input.input(instance, target, insertData, 'insertFromPaste');
            }
        };
    }
};
