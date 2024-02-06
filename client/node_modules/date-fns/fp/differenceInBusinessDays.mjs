// This file is generated automatically by `scripts/build/fp.ts`. Please, don't change it.
import { differenceInBusinessDays as fn } from "../differenceInBusinessDays.mjs";
import { convertToFP } from "./_lib/convertToFP.mjs";

export const differenceInBusinessDays = convertToFP(fn, 2);

// Fallback for modularized imports:
export default differenceInBusinessDays;
