import { formatDistance } from "./he/_lib/formatDistance.mjs";
import { formatLong } from "./he/_lib/formatLong.mjs";
import { formatRelative } from "./he/_lib/formatRelative.mjs";
import { localize } from "./he/_lib/localize.mjs";
import { match } from "./he/_lib/match.mjs";

/**
 * @category Locales
 * @summary Hebrew locale.
 * @language Hebrew
 * @iso-639-2 heb
 * @author Nir Lahad [@nirlah](https://github.com/nirlah)
 */
export const he = {
  code: "he",
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
export default he;
