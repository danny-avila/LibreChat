import { formatDistance } from "./cy/_lib/formatDistance.mjs";
import { formatLong } from "./cy/_lib/formatLong.mjs";
import { formatRelative } from "./cy/_lib/formatRelative.mjs";
import { localize } from "./cy/_lib/localize.mjs";
import { match } from "./cy/_lib/match.mjs";

/**
 * @category Locales
 * @summary Welsh locale.
 * @language Welsh
 * @iso-639-2 cym
 * @author Elwyn Malethan [@elmomalmo](https://github.com/elmomalmo)
 */
export const cy = {
  code: "cy",
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
export default cy;
