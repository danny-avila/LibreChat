import { formatDistance } from "./lb/_lib/formatDistance.mjs";
import { formatLong } from "./lb/_lib/formatLong.mjs";
import { formatRelative } from "./lb/_lib/formatRelative.mjs";
import { localize } from "./lb/_lib/localize.mjs";
import { match } from "./lb/_lib/match.mjs";

/**
 * @category Locales
 * @summary Luxembourgish locale.
 * @language Luxembourgish
 * @iso-639-2 ltz
 * @author Daniel Waxweiler [@dwaxweiler](https://github.com/dwaxweiler)
 */
export const lb = {
  code: "lb",
  formatDistance: formatDistance,
  formatLong: formatLong,
  formatRelative: formatRelative,
  localize: localize,
  match: match,
  options: {
    weekStartsOn: 1 /* Monday */,
    firstWeekContainsDate: 4,
  },
};

// Fallback for modularized imports:
export default lb;
