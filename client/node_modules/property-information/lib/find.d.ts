/**
 * @param {Schema} schema
 * @param {string} value
 * @returns {Info}
 */
export function find(schema: Schema, value: string): Info;
export type Schema = import('./util/schema.js').Schema;
import { Info } from './util/info.js';
