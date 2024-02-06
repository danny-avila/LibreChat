import { getNonce } from 'get-nonce';
function makeStyleTag() {
    if (!document)
        return null;
    const tag = document.createElement('style');
    tag.type = 'text/css';
    const nonce = getNonce();
    if (nonce) {
        tag.setAttribute('nonce', nonce);
    }
    return tag;
}
function injectStyles(tag, css) {
    // @ts-ignore
    if (tag.styleSheet) {
        // @ts-ignore
        tag.styleSheet.cssText = css;
    }
    else {
        tag.appendChild(document.createTextNode(css));
    }
}
function insertStyleTag(tag) {
    const head = document.head || document.getElementsByTagName('head')[0];
    head.appendChild(tag);
}
export const stylesheetSingleton = () => {
    let counter = 0;
    let stylesheet = null;
    return {
        add: (style) => {
            if (counter == 0) {
                if ((stylesheet = makeStyleTag())) {
                    injectStyles(stylesheet, style);
                    insertStyleTag(stylesheet);
                }
            }
            counter++;
        },
        remove: () => {
            counter--;
            if (!counter && stylesheet) {
                stylesheet.parentNode && stylesheet.parentNode.removeChild(stylesheet);
                stylesheet = null;
            }
        },
    };
};
