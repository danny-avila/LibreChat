// This file is generated automatically by `scripts/build/fp.ts`. Please, don't change it.
import { formatRFC3339 as fn } from "../formatRFC3339.mjs";
import { convertToFP } from "./_lib/convertToFP.mjs";

export const formatRFC3339 = convertToFP(fn, 1);

// Fallback for modularized imports:
export default formatRFC3339;
