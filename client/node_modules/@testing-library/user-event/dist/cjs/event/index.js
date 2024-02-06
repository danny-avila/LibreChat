'use strict';

var dispatchEvent = require('./dispatchEvent.js');
var focus = require('./focus.js');
var input = require('./input.js');
require('../utils/click/isClickableInput.js');
require('../utils/dataTransfer/Clipboard.js');
require('../utils/edit/isEditable.js');
require('../utils/edit/maxLength.js');
require('../utils/keyDef/readNextDescriptor.js');
require('../utils/misc/level.js');
require('../options.js');
var setSelectionPerMouse = require('./selection/setSelectionPerMouse.js');
var modifySelectionPerMouse = require('./selection/modifySelectionPerMouse.js');
var selectAll = require('./selection/selectAll.js');



exports.dispatchDOMEvent = dispatchEvent.dispatchDOMEvent;
exports.dispatchEvent = dispatchEvent.dispatchEvent;
exports.dispatchUIEvent = dispatchEvent.dispatchUIEvent;
exports.blurElement = focus.blurElement;
exports.focusElement = focus.focusElement;
exports.input = input.input;
exports.setSelectionPerMouseDown = setSelectionPerMouse.setSelectionPerMouseDown;
exports.modifySelectionPerMouseMove = modifySelectionPerMouse.modifySelectionPerMouseMove;
exports.isAllSelected = selectAll.isAllSelected;
exports.selectAll = selectAll.selectAll;
