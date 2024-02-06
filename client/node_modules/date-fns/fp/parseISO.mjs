// This file is generated automatically by `scripts/build/fp.ts`. Please, don't change it.
import { parseISO as fn } from "../parseISO.mjs";
import { convertToFP } from "./_lib/convertToFP.mjs";

export const parseISO = convertToFP(fn, 1);

// Fallback for modularized imports:
export default parseISO;
