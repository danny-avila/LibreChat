// This file is generated automatically by `scripts/build/fp.ts`. Please, don't change it.
import { getUnixTime as fn } from "../getUnixTime.mjs";
import { convertToFP } from "./_lib/convertToFP.mjs";

export const getUnixTime = convertToFP(fn, 1);

// Fallback for modularized imports:
export default getUnixTime;
