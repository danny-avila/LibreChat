// This file is generated automatically by `scripts/build/fp.ts`. Please, don't change it.
import { isBefore as fn } from "../isBefore.mjs";
import { convertToFP } from "./_lib/convertToFP.mjs";

export const isBefore = convertToFP(fn, 2);

// Fallback for modularized imports:
export default isBefore;
