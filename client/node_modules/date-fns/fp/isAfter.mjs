// This file is generated automatically by `scripts/build/fp.ts`. Please, don't change it.
import { isAfter as fn } from "../isAfter.mjs";
import { convertToFP } from "./_lib/convertToFP.mjs";

export const isAfter = convertToFP(fn, 2);

// Fallback for modularized imports:
export default isAfter;
