import { formatDistance } from "./fy/_lib/formatDistance.mjs";
import { formatLong } from "./fy/_lib/formatLong.mjs";
import { formatRelative } from "./fy/_lib/formatRelative.mjs";
import { localize } from "./fy/_lib/localize.mjs";
import { match } from "./fy/_lib/match.mjs";

/**
 * @category Locales
 * @summary Western Frisian locale (Netherlands).
 * @language West Frisian
 * @iso-639-2 fry
 * @author Damon Asberg [@damon02](https://github.com/damon02)
 */
export const fy = {
  code: "fy",
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
export default fy;
