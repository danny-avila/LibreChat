// This file is generated automatically by `scripts/build/fp.ts`. Please, don't change it.
import { getYear as fn } from "../getYear.mjs";
import { convertToFP } from "./_lib/convertToFP.mjs";

export const getYear = convertToFP(fn, 1);

// Fallback for modularized imports:
export default getYear;
