import { formatDistance } from "./ar-DZ/_lib/formatDistance.mjs";
import { formatLong } from "./ar-DZ/_lib/formatLong.mjs";
import { formatRelative } from "./ar-DZ/_lib/formatRelative.mjs";
import { localize } from "./ar-DZ/_lib/localize.mjs";
import { match } from "./ar-DZ/_lib/match.mjs";

/**
 * @category Locales
 * @summary Arabic locale (Algerian Arabic).
 * @language Algerian Arabic
 * @iso-639-2 ara
 * @author Badreddine Boumaza [@badre429](https://github.com/badre429)
 * @author Ahmed ElShahat [@elshahat](https://github.com/elshahat)
 */
export const arDZ = {
  code: "ar-DZ",
  formatDistance: formatDistance,
  formatLong: formatLong,
  formatRelative: formatRelative,
  localize: localize,
  match: match,
  options: {
    weekStartsOn: 0 /* Sunday */,
    firstWeekContainsDate: 1,
  },
};

// Fallback for modularized imports:
export default arDZ;
