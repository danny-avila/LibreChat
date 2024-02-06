import { formatDistance } from "./it/_lib/formatDistance.mjs";
import { formatRelative } from "./it/_lib/formatRelative.mjs";
import { localize } from "./it/_lib/localize.mjs";
import { match } from "./it/_lib/match.mjs";
import { formatLong } from "./it-CH/_lib/formatLong.mjs";

/**
 * @category Locales
 * @summary Italian locale (Switzerland).
 * @language Italian
 * @iso-639-2 ita
 * @author Mike Peyer [@maic66](https://github.com/maic66)
 */
export const itCH = {
  code: "it-CH",
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
export default itCH;
