import { formatDistance } from "./el/_lib/formatDistance.mjs";
import { formatLong } from "./el/_lib/formatLong.mjs";
import { formatRelative } from "./el/_lib/formatRelative.mjs";
import { localize } from "./el/_lib/localize.mjs";
import { match } from "./el/_lib/match.mjs";

/**
 * @category Locales
 * @summary Greek locale.
 * @language Greek
 * @iso-639-2 ell
 * @author Fanis Katsimpas [@fanixk](https://github.com/fanixk)
 * @author Theodoros Orfanidis [@teoulas](https://github.com/teoulas)
 */
export const el = {
  code: "el",
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
export default el;
