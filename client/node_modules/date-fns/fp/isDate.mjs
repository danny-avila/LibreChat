// This file is generated automatically by `scripts/build/fp.ts`. Please, don't change it.
import { isDate as fn } from "../isDate.mjs";
import { convertToFP } from "./_lib/convertToFP.mjs";

export const isDate = convertToFP(fn, 1);

// Fallback for modularized imports:
export default isDate;
