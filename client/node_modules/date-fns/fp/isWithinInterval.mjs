// This file is generated automatically by `scripts/build/fp.ts`. Please, don't change it.
import { isWithinInterval as fn } from "../isWithinInterval.mjs";
import { convertToFP } from "./_lib/convertToFP.mjs";

export const isWithinInterval = convertToFP(fn, 2);

// Fallback for modularized imports:
export default isWithinInterval;
