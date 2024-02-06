// This file is generated automatically by `scripts/build/fp.ts`. Please, don't change it.
import { getQuarter as fn } from "../getQuarter.mjs";
import { convertToFP } from "./_lib/convertToFP.mjs";

export const getQuarter = convertToFP(fn, 1);

// Fallback for modularized imports:
export default getQuarter;
