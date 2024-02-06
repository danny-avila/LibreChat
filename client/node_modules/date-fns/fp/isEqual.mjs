// This file is generated automatically by `scripts/build/fp.ts`. Please, don't change it.
import { isEqual as fn } from "../isEqual.mjs";
import { convertToFP } from "./_lib/convertToFP.mjs";

export const isEqual = convertToFP(fn, 2);

// Fallback for modularized imports:
export default isEqual;
