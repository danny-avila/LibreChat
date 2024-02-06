var DoubleIndexedKV = /** @class */ (function () {
    function DoubleIndexedKV() {
        this.keyToValue = new Map();
        this.valueToKey = new Map();
    }
    DoubleIndexedKV.prototype.set = function (key, value) {
        this.keyToValue.set(key, value);
        this.valueToKey.set(value, key);
    };
    DoubleIndexedKV.prototype.getByKey = function (key) {
        return this.keyToValue.get(key);
    };
    DoubleIndexedKV.prototype.getByValue = function (value) {
        return this.valueToKey.get(value);
    };
    DoubleIndexedKV.prototype.clear = function () {
        this.keyToValue.clear();
        this.valueToKey.clear();
    };
    return DoubleIndexedKV;
}());
export { DoubleIndexedKV };
//# sourceMappingURL=double-indexed-kv.js.map