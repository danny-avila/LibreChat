import '../utils/click/isClickableInput.js';
import { createFileList } from '../utils/dataTransfer/FileList.js';
import '../utils/dataTransfer/Clipboard.js';
import '../utils/edit/isEditable.js';
import '../utils/edit/maxLength.js';
import { setFiles } from '../utils/edit/setFiles.js';
import { isElementType } from '../utils/misc/isElementType.js';
import { isDisabled } from '../utils/misc/isDisabled.js';
import { getWindow } from '../utils/misc/getWindow.js';
import '../utils/keyDef/readNextDescriptor.js';
import '../utils/misc/level.js';
import '../options.js';

async function upload(element, fileOrFiles) {
    const input = isElementType(element, 'label') ? element.control : element;
    if (!input || !isElementType(input, 'input', {
        type: 'file'
    })) {
        throw new TypeError(`The ${input === element ? 'given' : 'associated'} ${input === null || input === void 0 ? void 0 : input.tagName} element does not accept file uploads`);
    }
    if (isDisabled(element)) return;
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
        setFiles(input, createFileList(getWindow(element), files));
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

export { upload };
