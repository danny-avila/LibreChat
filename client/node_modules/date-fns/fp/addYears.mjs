// This file is generated automatically by `scripts/build/fp.ts`. Please, don't change it.
import { addYears as fn } from "../addYears.mjs";
import { convertToFP } from "./_lib/convertToFP.mjs";

export const addYears = convertToFP(fn, 2);

// Fallback for modularized imports:
export default addYears;
