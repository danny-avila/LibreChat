import { formatDistance } from "./hi/_lib/formatDistance.mjs";
import { formatLong } from "./hi/_lib/formatLong.mjs";
import { formatRelative } from "./hi/_lib/formatRelative.mjs";
import { localize } from "./hi/_lib/localize.mjs";
import { match } from "./hi/_lib/match.mjs";

/**
 * @category Locales
 * @summary Hindi locale (India).
 * @language Hindi
 * @iso-639-2 hin
 * @author Mukesh Mandiwal [@mukeshmandiwal](https://github.com/mukeshmandiwal)
 */
export const hi = {
  code: "hi",
  formatDistance: formatDistance,
  formatLong: formatLong,
  formatRelative: formatRelative,
  localize: localize,
  match: match,
  options: {
    weekStartsOn: 0 /* Monday */,
    firstWeekContainsDate: 4,
  },
};

// Fallback for modularized imports:
export default hi;
