"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMimeType = void 0;
var WOFF = 'application/font-woff';
var JPEG = 'image/jpeg';
var mimes = {
    woff: WOFF,
    woff2: WOFF,
    ttf: 'application/font-truetype',
    eot: 'application/vnd.ms-fontobject',
    png: 'image/png',
    jpg: JPEG,
    jpeg: JPEG,
    gif: 'image/gif',
    tiff: 'image/tiff',
    svg: 'image/svg+xml',
    webp: 'image/webp',
};
function getExtension(url) {
    var match = /\.([^./]*?)$/g.exec(url);
    return match ? match[1] : '';
}
function getMimeType(url) {
    var extension = getExtension(url).toLowerCase();
    return mimes[extension] || '';
}
exports.getMimeType = getMimeType;
//# sourceMappingURL=mimes.js.map