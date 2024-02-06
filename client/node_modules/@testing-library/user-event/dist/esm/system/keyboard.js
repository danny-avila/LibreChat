import '../utils/click/isClickableInput.js';
import '../utils/dataTransfer/Clipboard.js';
import '../utils/edit/isEditable.js';
import '../utils/edit/maxLength.js';
import { getActiveElementOrBody } from '../utils/focus/getActiveElement.js';
import '../utils/keyDef/readNextDescriptor.js';
import '../utils/misc/level.js';
import '../options.js';

function _define_property(obj, key, value) {
    if (key in obj) {
        Object.defineProperty(obj, key, {
            value: value,
            enumerable: true,
            configurable: true,
            writable: true
        });
    } else {
        obj[key] = value;
    }
    return obj;
}
var DOM_KEY_LOCATION;
(function(DOM_KEY_LOCATION) {
    DOM_KEY_LOCATION[DOM_KEY_LOCATION["STANDARD"] = 0] = "STANDARD";
    DOM_KEY_LOCATION[DOM_KEY_LOCATION["LEFT"] = 1] = "LEFT";
    DOM_KEY_LOCATION[DOM_KEY_LOCATION["RIGHT"] = 2] = "RIGHT";
    DOM_KEY_LOCATION[DOM_KEY_LOCATION["NUMPAD"] = 3] = "NUMPAD";
})(DOM_KEY_LOCATION || (DOM_KEY_LOCATION = {}));
const modifierKeys = [
    'Alt',
    'AltGraph',
    'Control',
    'Fn',
    'Meta',
    'Shift',
    'Symbol'
];
function isModifierKey(key) {
    return modifierKeys.includes(key);
}
const modifierLocks = [
    'CapsLock',
    'FnLock',
    'NumLock',
    'ScrollLock',
    'SymbolLock'
];
function isModifierLock(key) {
    return modifierLocks.includes(key);
}
class KeyboardHost {
    isKeyPressed(keyDef) {
        return !!this.pressed[String(keyDef.code)];
    }
    getPressedKeys() {
        return Object.values(this.pressed).map((p)=>p.keyDef);
    }
    /** Press a key */ async keydown(instance, keyDef) {
        var // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        _this_pressed, _code, _this_pressed_code;
        const key = String(keyDef.key);
        const code = String(keyDef.code);
        const target = getActiveElementOrBody(instance.config.document);
        this.setKeydownTarget(target);
        var _;
        (_ = (_this_pressed = this.pressed)[_code = code]) !== null && _ !== void 0 ? _ : _this_pressed[_code] = {
            keyDef,
            unpreventedDefault: false
        };
        if (isModifierKey(key)) {
            this.modifiers[key] = true;
        }
        const unprevented = instance.dispatchUIEvent(target, 'keydown', {
            key,
            code
        });
        if (isModifierLock(key) && !this.modifiers[key]) {
            this.modifiers[key] = true;
            this.modifierLockStart[key] = true;
        }
        (_this_pressed_code = this.pressed[code]).unpreventedDefault || (_this_pressed_code.unpreventedDefault = unprevented);
        if (unprevented && this.hasKeyPress(key)) {
            instance.dispatchUIEvent(getActiveElementOrBody(instance.config.document), 'keypress', {
                key,
                code,
                charCode: keyDef.key === 'Enter' ? 13 : String(keyDef.key).charCodeAt(0)
            });
        }
    }
    /** Release a key */ async keyup(instance, keyDef) {
        const key = String(keyDef.key);
        const code = String(keyDef.code);
        const unprevented = this.pressed[code].unpreventedDefault;
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete this.pressed[code];
        if (isModifierKey(key) && !Object.values(this.pressed).find((p)=>p.keyDef.key === key)) {
            this.modifiers[key] = false;
        }
        instance.dispatchUIEvent(getActiveElementOrBody(instance.config.document), 'keyup', {
            key,
            code
        }, !unprevented);
        if (isModifierLock(key) && this.modifiers[key]) {
            if (this.modifierLockStart[key]) {
                this.modifierLockStart[key] = false;
            } else {
                this.modifiers[key] = false;
            }
        }
    }
    setKeydownTarget(target) {
        if (target !== this.lastKeydownTarget) {
            this.carryChar = '';
        }
        this.lastKeydownTarget = target;
    }
    hasKeyPress(key) {
        return (key.length === 1 || key === 'Enter') && !this.modifiers.Control && !this.modifiers.Alt;
    }
    constructor(system){
        _define_property(this, "system", void 0);
        _define_property(this, "modifiers", {
            Alt: false,
            AltGraph: false,
            CapsLock: false,
            Control: false,
            Fn: false,
            FnLock: false,
            Meta: false,
            NumLock: false,
            ScrollLock: false,
            Shift: false,
            Symbol: false,
            SymbolLock: false
        });
        _define_property(this, "pressed", {});
        _define_property(this, "carryChar", '');
        _define_property(this, "lastKeydownTarget", undefined);
        _define_property(this, "modifierLockStart", {});
        this.system = system;
    }
}

export { DOM_KEY_LOCATION, KeyboardHost };
