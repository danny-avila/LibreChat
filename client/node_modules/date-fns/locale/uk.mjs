import { formatDistance } from "./uk/_lib/formatDistance.mjs";
import { formatLong } from "./uk/_lib/formatLong.mjs";
import { formatRelative } from "./uk/_lib/formatRelative.mjs";
import { localize } from "./uk/_lib/localize.mjs";
import { match } from "./uk/_lib/match.mjs";

/**
 * @category Locales
 * @summary Ukrainian locale.
 * @language Ukrainian
 * @iso-639-2 ukr
 * @author Andrii Korzh [@korzhyk](https://github.com/korzhyk)
 * @author Andriy Shcherbyak [@shcherbyakdev](https://github.com/shcherbyakdev)
 */
export const uk = {
  code: "uk",
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
export default uk;
