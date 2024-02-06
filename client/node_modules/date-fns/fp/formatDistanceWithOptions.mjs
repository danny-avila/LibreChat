// This file is generated automatically by `scripts/build/fp.ts`. Please, don't change it.
import { formatDistance as fn } from "../formatDistance.mjs";
import { convertToFP } from "./_lib/convertToFP.mjs";

export const formatDistanceWithOptions = convertToFP(fn, 3);

// Fallback for modularized imports:
export default formatDistanceWithOptions;
