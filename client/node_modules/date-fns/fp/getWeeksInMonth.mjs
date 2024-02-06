// This file is generated automatically by `scripts/build/fp.ts`. Please, don't change it.
import { getWeeksInMonth as fn } from "../getWeeksInMonth.mjs";
import { convertToFP } from "./_lib/convertToFP.mjs";

export const getWeeksInMonth = convertToFP(fn, 1);

// Fallback for modularized imports:
export default getWeeksInMonth;
