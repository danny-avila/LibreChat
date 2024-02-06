// This file is generated automatically by `scripts/build/fp.ts`. Please, don't change it.
import { isLeapYear as fn } from "../isLeapYear.mjs";
import { convertToFP } from "./_lib/convertToFP.mjs";

export const isLeapYear = convertToFP(fn, 1);

// Fallback for modularized imports:
export default isLeapYear;
