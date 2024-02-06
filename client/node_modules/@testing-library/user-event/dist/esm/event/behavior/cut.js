import '../../utils/click/isClickableInput.js';
import '../../utils/dataTransfer/Clipboard.js';
import { isEditable } from '../../utils/edit/isEditable.js';
import '../../utils/edit/maxLength.js';
import '../../utils/keyDef/readNextDescriptor.js';
import '../../utils/misc/level.js';
import '../../options.js';
import { input } from '../input.js';
import { behavior } from './registry.js';

behavior.cut = (event, target, instance)=>{
    return ()=>{
        if (isEditable(target)) {
            input(instance, target, '', 'deleteByCut');
        }
    };
};
