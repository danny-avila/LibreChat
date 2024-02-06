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

registry.behavior.cut = (event, target, instance)=>{
    return ()=>{
        if (isEditable.isEditable(target)) {
            input.input(instance, target, '', 'deleteByCut');
        }
    };
};
