export const zeroGap = {
    left: 0,
    top: 0,
    right: 0,
    gap: 0,
};
const parse = (x) => parseInt(x || '', 10) || 0;
const getOffset = (gapMode) => {
    const cs = window.getComputedStyle(document.body);
    const left = cs[gapMode === 'padding' ? 'paddingLeft' : 'marginLeft'];
    const top = cs[gapMode === 'padding' ? 'paddingTop' : 'marginTop'];
    const right = cs[gapMode === 'padding' ? 'paddingRight' : 'marginRight'];
    return [parse(left), parse(top), parse(right)];
};
export const getGapWidth = (gapMode = 'margin') => {
    if (typeof window === 'undefined') {
        return zeroGap;
    }
    const offsets = getOffset(gapMode);
    const documentWidth = document.documentElement.clientWidth;
    const windowWidth = window.innerWidth;
    return {
        left: offsets[0],
        top: offsets[1],
        right: offsets[2],
        gap: Math.max(0, windowWidth - documentWidth + offsets[2] - offsets[0]),
    };
};
