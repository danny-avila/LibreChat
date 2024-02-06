// This file is generated automatically by `scripts/build/fp.ts`. Please, don't change it.
import { getTime as fn } from "../getTime.mjs";
import { convertToFP } from "./_lib/convertToFP.mjs";

export const getTime = convertToFP(fn, 1);

// Fallback for modularized imports:
export default getTime;
