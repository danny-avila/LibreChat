// This file is generated automatically by `scripts/build/fp.ts`. Please, don't change it.
import { parse as fn } from "../parse.mjs";
import { convertToFP } from "./_lib/convertToFP.mjs";

export const parse = convertToFP(fn, 3);

// Fallback for modularized imports:
export default parse;
