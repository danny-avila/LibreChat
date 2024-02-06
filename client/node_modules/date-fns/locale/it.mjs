import { formatDistance } from "./it/_lib/formatDistance.mjs";
import { formatLong } from "./it/_lib/formatLong.mjs";
import { formatRelative } from "./it/_lib/formatRelative.mjs";
import { localize } from "./it/_lib/localize.mjs";
import { match } from "./it/_lib/match.mjs";

/**
 * @category Locales
 * @summary Italian locale.
 * @language Italian
 * @iso-639-2 ita
 * @author Alberto Restifo [@albertorestifo](https://github.com/albertorestifo)
 * @author Giovanni Polimeni [@giofilo](https://github.com/giofilo)
 * @author Vincenzo Carrese [@vin-car](https://github.com/vin-car)
 */
export const it = {
  code: "it",
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
export default it;
