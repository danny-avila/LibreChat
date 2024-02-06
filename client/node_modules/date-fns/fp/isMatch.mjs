// This file is generated automatically by `scripts/build/fp.ts`. Please, don't change it.
import { isMatch as fn } from "../isMatch.mjs";
import { convertToFP } from "./_lib/convertToFP.mjs";

export const isMatch = convertToFP(fn, 2);

// Fallback for modularized imports:
export default isMatch;
