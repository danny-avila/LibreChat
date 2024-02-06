import { formatDistance } from "./sr-Latn/_lib/formatDistance.mjs";
import { formatLong } from "./sr-Latn/_lib/formatLong.mjs";
import { formatRelative } from "./sr-Latn/_lib/formatRelative.mjs";
import { localize } from "./sr-Latn/_lib/localize.mjs";
import { match } from "./sr-Latn/_lib/match.mjs";

/**
 * @category Locales
 * @summary Serbian latin locale.
 * @language Serbian
 * @iso-639-2 srp
 * @author Igor Radivojević [@rogyvoje](https://github.com/rogyvoje)
 */
export const srLatn = {
  code: "sr-Latn",
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
export default srLatn;
