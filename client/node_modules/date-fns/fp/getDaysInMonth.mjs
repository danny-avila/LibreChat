// This file is generated automatically by `scripts/build/fp.ts`. Please, don't change it.
import { getDaysInMonth as fn } from "../getDaysInMonth.mjs";
import { convertToFP } from "./_lib/convertToFP.mjs";

export const getDaysInMonth = convertToFP(fn, 1);

// Fallback for modularized imports:
export default getDaysInMonth;
