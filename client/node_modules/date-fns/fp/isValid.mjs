// This file is generated automatically by `scripts/build/fp.ts`. Please, don't change it.
import { isValid as fn } from "../isValid.mjs";
import { convertToFP } from "./_lib/convertToFP.mjs";

export const isValid = convertToFP(fn, 1);

// Fallback for modularized imports:
export default isValid;
