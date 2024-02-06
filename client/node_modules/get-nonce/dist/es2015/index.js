var currentNonce;
export var setNonce = function (nonce) {
    currentNonce = nonce;
};
export var getNonce = function () {
    if (currentNonce) {
        return currentNonce;
    }
    if (typeof __webpack_nonce__ !== 'undefined') {
        return __webpack_nonce__;
    }
    return undefined;
};
