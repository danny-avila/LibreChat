// This file is generated automatically by `scripts/build/fp.ts`. Please, don't change it.
import { endOfDay as fn } from "../endOfDay.mjs";
import { convertToFP } from "./_lib/convertToFP.mjs";

export const endOfDay = convertToFP(fn, 1);

// Fallback for modularized imports:
export default endOfDay;
