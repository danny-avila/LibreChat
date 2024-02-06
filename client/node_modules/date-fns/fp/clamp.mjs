// This file is generated automatically by `scripts/build/fp.ts`. Please, don't change it.
import { clamp as fn } from "../clamp.mjs";
import { convertToFP } from "./_lib/convertToFP.mjs";

export const clamp = convertToFP(fn, 2);

// Fallback for modularized imports:
export default clamp;
