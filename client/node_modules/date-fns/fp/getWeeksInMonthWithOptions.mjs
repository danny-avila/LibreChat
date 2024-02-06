// This file is generated automatically by `scripts/build/fp.ts`. Please, don't change it.
import { getWeeksInMonth as fn } from "../getWeeksInMonth.mjs";
import { convertToFP } from "./_lib/convertToFP.mjs";

export const getWeeksInMonthWithOptions = convertToFP(fn, 2);

// Fallback for modularized imports:
export default getWeeksInMonthWithOptions;
