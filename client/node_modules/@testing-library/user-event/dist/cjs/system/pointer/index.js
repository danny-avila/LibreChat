'use strict';

var buttons = require('./buttons.js');
var device = require('./device.js');
var mouse = require('./mouse.js');
var pointer = require('./pointer.js');

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
class PointerHost {
    isKeyPressed(keyDef) {
        return this.devices.get(keyDef.pointerType).isPressed(keyDef);
    }
    async press(instance, keyDef, position) {
        const pointerName = this.getPointerName(keyDef);
        const pointer = keyDef.pointerType === 'touch' ? this.pointers.new(pointerName, keyDef).init(instance, position) : this.pointers.get(pointerName);
        // TODO: deprecate the following implicit setting of position
        pointer.position = position;
        if (pointer.pointerType !== 'touch') {
            this.mouse.position = position;
        }
        this.devices.get(keyDef.pointerType).addPressed(keyDef);
        this.buttons.down(keyDef);
        pointer.down(instance, keyDef);
        if (pointer.pointerType !== 'touch' && !pointer.isPrevented) {
            this.mouse.down(instance, keyDef, pointer);
        }
    }
    async move(instance, pointerName, position) {
        const pointer = this.pointers.get(pointerName);
        // In (some?) browsers this order of events can be observed.
        // This interweaving of events is probably unnecessary.
        // While the order of mouse (or pointer) events is defined per spec,
        // the order in which they interweave/follow on a user interaction depends on the implementation.
        const pointermove = pointer.move(instance, position);
        const mousemove = pointer.pointerType === 'touch' || pointer.isPrevented && pointer.isDown ? undefined : this.mouse.move(instance, position);
        pointermove === null || pointermove === void 0 ? void 0 : pointermove.leave();
        mousemove === null || mousemove === void 0 ? void 0 : mousemove.leave();
        pointermove === null || pointermove === void 0 ? void 0 : pointermove.enter();
        mousemove === null || mousemove === void 0 ? void 0 : mousemove.enter();
        pointermove === null || pointermove === void 0 ? void 0 : pointermove.move();
        mousemove === null || mousemove === void 0 ? void 0 : mousemove.move();
    }
    async release(instance, keyDef, position) {
        const device = this.devices.get(keyDef.pointerType);
        device.removePressed(keyDef);
        this.buttons.up(keyDef);
        const pointer = this.pointers.get(this.getPointerName(keyDef));
        // TODO: deprecate the following implicit setting of position
        pointer.position = position;
        if (pointer.pointerType !== 'touch') {
            this.mouse.position = position;
        }
        if (device.countPressed === 0) {
            pointer.up(instance, keyDef);
        }
        if (pointer.pointerType === 'touch') {
            pointer.release(instance);
        }
        if (!pointer.isPrevented) {
            if (pointer.pointerType === 'touch' && !pointer.isMultitouch) {
                const mousemove = this.mouse.move(instance, pointer.position);
                mousemove === null || mousemove === void 0 ? void 0 : mousemove.leave();
                mousemove === null || mousemove === void 0 ? void 0 : mousemove.enter();
                mousemove === null || mousemove === void 0 ? void 0 : mousemove.move();
                this.mouse.down(instance, keyDef, pointer);
            }
            if (!pointer.isMultitouch) {
                const mousemove = this.mouse.move(instance, pointer.position);
                mousemove === null || mousemove === void 0 ? void 0 : mousemove.leave();
                mousemove === null || mousemove === void 0 ? void 0 : mousemove.enter();
                mousemove === null || mousemove === void 0 ? void 0 : mousemove.move();
                this.mouse.up(instance, keyDef, pointer);
            }
        }
    }
    getPointerName(keyDef) {
        return keyDef.pointerType === 'touch' ? keyDef.name : keyDef.pointerType;
    }
    getPreviousPosition(pointerName) {
        return this.pointers.has(pointerName) ? this.pointers.get(pointerName).position : undefined;
    }
    resetClickCount() {
        this.mouse.resetClickCount();
    }
    getMouseTarget(instance) {
        var _this_mouse_position_target;
        return (_this_mouse_position_target = this.mouse.position.target) !== null && _this_mouse_position_target !== void 0 ? _this_mouse_position_target : instance.config.document.body;
    }
    setMousePosition(position) {
        this.mouse.position = position;
        this.pointers.get('mouse').position = position;
    }
    constructor(system){
        _define_property(this, "system", void 0);
        _define_property(this, "mouse", void 0);
        _define_property(this, "buttons", void 0);
        _define_property(this, "devices", new class {
            get(k) {
                var // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                _this_registry, _k;
                var _;
                (_ = (_this_registry = this.registry)[_k = k]) !== null && _ !== void 0 ? _ : _this_registry[_k] = new device.Device();
                return this.registry[k];
            }
            constructor(){
                _define_property(this, "registry", {});
            }
        }());
        _define_property(this, "pointers", new class {
            new(pointerName, keyDef) {
                const isPrimary = keyDef.pointerType !== 'touch' || !Object.values(this.registry).some((p)=>p.pointerType === 'touch' && !p.isCancelled);
                if (!isPrimary) {
                    Object.values(this.registry).forEach((p)=>{
                        if (p.pointerType === keyDef.pointerType && !p.isCancelled) {
                            p.isMultitouch = true;
                        }
                    });
                }
                this.registry[pointerName] = new pointer.Pointer({
                    pointerId: this.nextId++,
                    pointerType: keyDef.pointerType,
                    isPrimary
                });
                return this.registry[pointerName];
            }
            get(pointerName) {
                if (!this.has(pointerName)) {
                    throw new Error(`Trying to access pointer "${pointerName}" which does not exist.`);
                }
                return this.registry[pointerName];
            }
            has(pointerName) {
                return pointerName in this.registry;
            }
            constructor(){
                _define_property(this, "registry", {
                    mouse: new pointer.Pointer({
                        pointerId: 1,
                        pointerType: 'mouse',
                        isPrimary: true
                    })
                });
                _define_property(this, "nextId", 2);
            }
        }());
        this.system = system;
        this.buttons = new buttons.Buttons();
        this.mouse = new mouse.Mouse();
    }
}

exports.PointerHost = PointerHost;
