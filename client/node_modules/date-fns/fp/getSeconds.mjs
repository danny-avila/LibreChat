// This file is generated automatically by `scripts/build/fp.ts`. Please, don't change it.
import { getSeconds as fn } from "../getSeconds.mjs";
import { convertToFP } from "./_lib/convertToFP.mjs";

export const getSeconds = convertToFP(fn, 1);

// Fallback for modularized imports:
export default getSeconds;
