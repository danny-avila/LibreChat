import { formatDistance } from "./kk/_lib/formatDistance.mjs";
import { formatLong } from "./kk/_lib/formatLong.mjs";
import { formatRelative } from "./kk/_lib/formatRelative.mjs";
import { localize } from "./kk/_lib/localize.mjs";
import { match } from "./kk/_lib/match.mjs";

/**
 * @category Locales
 * @summary Kazakh locale.
 * @language Kazakh
 * @iso-639-2 kaz
 * @author Nikita Bayev [@drugoi](https://github.com/drugoi)
 */
export const kk = {
  code: "kk",
  formatDistance: formatDistance,
  formatLong: formatLong,
  formatRelative: formatRelative,
  localize: localize,
  match: match,
  options: {
    weekStartsOn: 1 /* Monday */,
    firstWeekContainsDate: 1,
  },
};

// Fallback for modularized imports:
export default kk;
