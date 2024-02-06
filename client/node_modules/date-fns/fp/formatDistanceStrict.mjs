// This file is generated automatically by `scripts/build/fp.ts`. Please, don't change it.
import { formatDistanceStrict as fn } from "../formatDistanceStrict.mjs";
import { convertToFP } from "./_lib/convertToFP.mjs";

export const formatDistanceStrict = convertToFP(fn, 2);

// Fallback for modularized imports:
export default formatDistanceStrict;
