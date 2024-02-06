export var escapeKey = function (key) { return key.replace(/\./g, '\\.'); };
export var stringifyPath = function (path) {
    return path
        .map(String)
        .map(escapeKey)
        .join('.');
};
export var parsePath = function (string) {
    var result = [];
    var segment = '';
    for (var i = 0; i < string.length; i++) {
        var char = string.charAt(i);
        var isEscapedDot = char === '\\' && string.charAt(i + 1) === '.';
        if (isEscapedDot) {
            segment += '.';
            i++;
            continue;
        }
        var isEndOfSegment = char === '.';
        if (isEndOfSegment) {
            result.push(segment);
            segment = '';
            continue;
        }
        segment += char;
    }
    var lastSegment = segment;
    result.push(lastSegment);
    return result;
};
//# sourceMappingURL=pathstringifier.js.map