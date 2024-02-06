/**
 * `hast` is close to `React`, but differs in a couple of cases.
 *
 * To get a React property from a hast property, check if it is in
 * `hastToReact`, if it is, then use the corresponding value,
 * otherwise, use the hast property.
 *
 * @type {Record<string, string>}
 */
export const hastToReact: Record<string, string>;
