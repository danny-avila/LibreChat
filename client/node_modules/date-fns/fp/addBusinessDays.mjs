// This file is generated automatically by `scripts/build/fp.ts`. Please, don't change it.
import { addBusinessDays as fn } from "../addBusinessDays.mjs";
import { convertToFP } from "./_lib/convertToFP.mjs";

export const addBusinessDays = convertToFP(fn, 2);

// Fallback for modularized imports:
export default addBusinessDays;
