// This file is generated automatically by `scripts/build/fp.ts`. Please, don't change it.
import { getWeekOfMonth as fn } from "../getWeekOfMonth.mjs";
import { convertToFP } from "./_lib/convertToFP.mjs";

export const getWeekOfMonthWithOptions = convertToFP(fn, 2);

// Fallback for modularized imports:
export default getWeekOfMonthWithOptions;
