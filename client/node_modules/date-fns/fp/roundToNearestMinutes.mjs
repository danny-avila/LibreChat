// This file is generated automatically by `scripts/build/fp.ts`. Please, don't change it.
import { roundToNearestMinutes as fn } from "../roundToNearestMinutes.mjs";
import { convertToFP } from "./_lib/convertToFP.mjs";

export const roundToNearestMinutes = convertToFP(fn, 1);

// Fallback for modularized imports:
export default roundToNearestMinutes;
