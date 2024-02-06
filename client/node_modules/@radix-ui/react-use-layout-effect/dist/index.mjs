import {useLayoutEffect as $dxlwH$useLayoutEffect} from "react";


/**
 * On the server, React emits a warning when calling `useLayoutEffect`.
 * This is because neither `useLayoutEffect` nor `useEffect` run on the server.
 * We use this safe version which suppresses the warning by replacing it with a noop on the server.
 *
 * See: https://reactjs.org/docs/hooks-reference.html#uselayouteffect
 */ const $9f79659886946c16$export$e5c5a5f917a5871c = Boolean(globalThis === null || globalThis === void 0 ? void 0 : globalThis.document) ? $dxlwH$useLayoutEffect : ()=>{};




export {$9f79659886946c16$export$e5c5a5f917a5871c as useLayoutEffect};
//# sourceMappingURL=index.mjs.map
