/**
 * @typedef {import('./info.js').Info} Info
 * @typedef {Record<string, Info>} Properties
 * @typedef {Record<string, string>} Normal
 */
export class Schema {
    /**
     * @constructor
     * @param {Properties} property
     * @param {Normal} normal
     * @param {string} [space]
     */
    constructor(property: Properties, normal: Normal, space?: string | undefined);
    property: Properties;
    normal: Normal;
    space: string | null;
}
export type Info = import('./info.js').Info;
export type Properties = Record<string, Info>;
export type Normal = Record<string, string>;
