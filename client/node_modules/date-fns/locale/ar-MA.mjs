import { formatDistance } from "./ar-MA/_lib/formatDistance.mjs";
import { formatLong } from "./ar-MA/_lib/formatLong.mjs";
import { formatRelative } from "./ar-MA/_lib/formatRelative.mjs";
import { localize } from "./ar-MA/_lib/localize.mjs";
import { match } from "./ar-MA/_lib/match.mjs";

/**
 * @category Locales
 * @summary Arabic locale (Moroccan Arabic).
 * @language Moroccan Arabic
 * @iso-639-2 ara
 * @author Achraf Rrami [@rramiachraf](https://github.com/rramiachraf)
 */
export const arMA = {
  code: "ar-MA",
  formatDistance: formatDistance,
  formatLong: formatLong,
  formatRelative: formatRelative,
  localize: localize,
  match: match,
  options: {
    // Monday is 1
    weekStartsOn: 1,
    firstWeekContainsDate: 1,
  },
};

// Fallback for modularized imports:
export default arMA;
