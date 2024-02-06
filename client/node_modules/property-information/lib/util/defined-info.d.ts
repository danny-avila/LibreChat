export class DefinedInfo extends Info {
    /**
     * @constructor
     * @param {string} property
     * @param {string} attribute
     * @param {number|null} [mask]
     * @param {string} [space]
     */
    constructor(property: string, attribute: string, mask?: number | null | undefined, space?: string | undefined);
}
import { Info } from './info.js';
