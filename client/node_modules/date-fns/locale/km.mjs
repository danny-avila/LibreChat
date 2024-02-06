import { formatDistance } from "./km/_lib/formatDistance.mjs";
import { formatLong } from "./km/_lib/formatLong.mjs";
import { formatRelative } from "./km/_lib/formatRelative.mjs";
import { localize } from "./km/_lib/localize.mjs";
import { match } from "./km/_lib/match.mjs";

/**
 * @category Locales
 * @summary Khmer locale (Cambodian).
 * @language Khmer
 * @iso-639-2 khm
 * @author Seanghay Yath [@seanghay](https://github.com/seanghay)
 */
export const km = {
  code: "km",
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
export default km;
