// This file is generated automatically by `scripts/build/fp.ts`. Please, don't change it.
import { formatDuration as fn } from "../formatDuration.mjs";
import { convertToFP } from "./_lib/convertToFP.mjs";

export const formatDuration = convertToFP(fn, 1);

// Fallback for modularized imports:
export default formatDuration;
