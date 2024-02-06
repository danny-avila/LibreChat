'use strict';

require('../utils/click/isClickableInput.js');
var FileList = require('../utils/dataTransfer/FileList.js');
require('../utils/dataTransfer/Clipboard.js');
require('../utils/edit/isEditable.js');
require('../utils/edit/maxLength.js');
var setFiles = require('../utils/edit/setFiles.js');
var isElementType = require('../utils/misc/isElementType.js');
var isDisabled = require('../utils/misc/isDisabled.js');
var getWindow = require('../utils/misc/getWindow.js');
require('../utils/keyDef/readNextDescriptor.js');
require('../utils/misc/level.js');
require('../options.js');

async function upload(element, fileOrFiles) {
    const input = isElementType.isElementType(element, 'label') ? element.control : element;
    if (!input || !isElementType.isElementType(input, 'input', {
        type: 'file'
    })) {
        throw new TypeError(`The ${input === element ? 'given' : 'associated'} ${input === null || input === void 0 ? void 0 : input.tagName} element does not accept file uploads`);
    }
    if (isDisabled.isDisabled(element)) return;
    const files = (Array.isArray(fileOrFiles) ? fileOrFiles : [
        fileOrFiles
    ]).filter((file)=>!this.config.applyAccept || isAcceptableFile(file, input.accept)).slice(0, input.multiple ? undefined : 1);
    const fileDialog = ()=>{
        var _input_files;
        // do not fire an input event if the file selection does not change
        if (files.length === ((_input_files = input.files) === null || _input_files === void 0 ? void 0 : _input_files.length) && files.every((f, i)=>{
            var _input_files;
            return f === ((_input_files = input.files) === null || _input_files === void 0 ? void 0 : _input_files.item(i));
        })) {
            return;
        }
        setFiles.setFiles(input, FileList.createFileList(getWindow.getWindow(element), files));
        this.dispatchUIEvent(input, 'input');
        this.dispatchUIEvent(input, 'change');
    };
    input.addEventListener('fileDialog', fileDialog);
    await this.click(element);
    input.removeEventListener('fileDialog', fileDialog);
}
function isAcceptableFile(file, accept) {
    if (!accept) {
        return true;
    }
    const wildcards = [
        'audio/*',
        'image/*',
        'video/*'
    ];
    return accept.split(',').some((acceptToken)=>{
        if (acceptToken.startsWith('.')) {
            // tokens starting with a dot represent a file extension
            return file.name.endsWith(acceptToken);
        } else if (wildcards.includes(acceptToken)) {
            return file.type.startsWith(acceptToken.substr(0, acceptToken.length - 1));
        }
        return file.type === acceptToken;
    });
}

exports.upload = upload;
