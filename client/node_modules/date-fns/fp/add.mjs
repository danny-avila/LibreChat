// This file is generated automatically by `scripts/build/fp.ts`. Please, don't change it.
import { add as fn } from "../add.mjs";
import { convertToFP } from "./_lib/convertToFP.mjs";

export const add = convertToFP(fn, 2);

// Fallback for modularized imports:
export default add;
