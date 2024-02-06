import { formatDistance } from "./ug/_lib/formatDistance.mjs";
import { formatLong } from "./ug/_lib/formatLong.mjs";
import { formatRelative } from "./ug/_lib/formatRelative.mjs";
import { localize } from "./ug/_lib/localize.mjs";
import { match } from "./ug/_lib/match.mjs";

/**
 * @category Locales
 * @summary Uighur locale
 * @language Uighur
 * @iso-639-2 uig
 * @author Abduwaly M. [@abduwaly](https://github.com/abduwaly)
 */
export const ug = {
  code: "ug",
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
export default ug;
