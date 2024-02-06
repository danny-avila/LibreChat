// This file is generated automatically by `scripts/build/fp.ts`. Please, don't change it.
import { getDate as fn } from "../getDate.mjs";
import { convertToFP } from "./_lib/convertToFP.mjs";

export const getDate = convertToFP(fn, 1);

// Fallback for modularized imports:
export default getDate;
