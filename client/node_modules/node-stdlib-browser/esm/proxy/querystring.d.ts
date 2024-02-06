/// <reference path="../types/lib.d.ts" />
/// <reference types="node" />
export default api;
export type qsEscape = typeof import("querystring").escape;
export type qsUnescape = typeof import("querystring").unescape;
declare namespace api {
    export { decode };
    export { encode };
    export { parse };
    export { stringify };
    export { qsEscape as escape };
    export { qsUnescape as unescape };
}
import { decode } from "querystring-es3";
import { encode } from "querystring-es3";
import { parse } from "querystring-es3";
import { stringify } from "querystring-es3";
/**
 * @type {qsEscape}
 */
declare function qsEscape(string: string): string;
/**
 * @type {qsUnescape}
 */
declare function qsUnescape(string: string): string;
export { decode, encode, parse, stringify, qsEscape as escape, qsUnescape as unescape };
//# sourceMappingURL=querystring.d.ts.map