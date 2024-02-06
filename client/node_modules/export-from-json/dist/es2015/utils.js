export function isArray(data) {
    return Object.prototype.toString.call(data) === '[object Array]';
}
export function assert(condition, msg) {
    if (!condition)
        throw new Error(msg);
}
export function getValues(data) {
    return Object.keys(data).map(key => data[key]);
}
export function getKeys(data) {
    return Object.keys(data);
}
export function getEntries(data) {
    return Object.keys(data).map(key => [key, data[key]]);
}
export function normalizeFileName(fileName, extension, fileNameFormatter) {
    const suffix = '.' + extension;
    const extensionPattern = new RegExp(`(\\${extension})?$`);
    return fileNameFormatter(fileName).replace(extensionPattern, suffix);
}
export function normalizeXMLName(name) {
    '555xmlHello .  world!'.trim().replace(/^([0-9,;]|(xml))+/, '');
    return name.replace(/[^_a-zA-Z 0-9:\-\.]/g, '').replace(/^([ 0-9-:\-\.]|(xml))+/i, '').replace(/ +/g, '-');
}
export function indent(spaces) {
    return Array(spaces + 1).join(' ');
}
export function stripHTML(text) {
    return text.replace(/([<>&])/g, (_, $1) => {
        switch ($1) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            default: return '';
        }
    });
}
