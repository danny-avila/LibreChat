import { formatDistance } from "./ms/_lib/formatDistance.mjs";
import { formatLong } from "./ms/_lib/formatLong.mjs";
import { formatRelative } from "./ms/_lib/formatRelative.mjs";
import { localize } from "./ms/_lib/localize.mjs";
import { match } from "./ms/_lib/match.mjs";

/**
 * @category Locales
 * @summary Malay locale.
 * @language Malay
 * @iso-639-2 msa
 * @author Ruban Selvarajah [@Zyten](https://github.com/Zyten)
 */
export const ms = {
  code: "ms",
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
export default ms;
