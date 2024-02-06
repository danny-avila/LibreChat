// This file is generated automatically by `scripts/build/fp.ts`. Please, don't change it.
import { parseJSON as fn } from "../parseJSON.mjs";
import { convertToFP } from "./_lib/convertToFP.mjs";

export const parseJSON = convertToFP(fn, 1);

// Fallback for modularized imports:
export default parseJSON;
