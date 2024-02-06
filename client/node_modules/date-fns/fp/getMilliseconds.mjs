// This file is generated automatically by `scripts/build/fp.ts`. Please, don't change it.
import { getMilliseconds as fn } from "../getMilliseconds.mjs";
import { convertToFP } from "./_lib/convertToFP.mjs";

export const getMilliseconds = convertToFP(fn, 1);

// Fallback for modularized imports:
export default getMilliseconds;
