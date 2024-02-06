import { memoize } from './utils/js_utils.js';
export const isFirefox = memoize(()=>/firefox/i.test(navigator.userAgent)
);
export const isSafari = memoize(()=>Boolean(window.safari)
);

//# sourceMappingURL=BrowserDetector.js.map