import { formatDistance } from "./nb/_lib/formatDistance.mjs";
import { formatLong } from "./nb/_lib/formatLong.mjs";
import { formatRelative } from "./nb/_lib/formatRelative.mjs";
import { localize } from "./nb/_lib/localize.mjs";
import { match } from "./nb/_lib/match.mjs";

/**
 * @category Locales
 * @summary Norwegian Bokmål locale.
 * @language Norwegian Bokmål
 * @iso-639-2 nob
 * @author Hans-Kristian Koren [@Hanse](https://github.com/Hanse)
 * @author Mikolaj Grzyb [@mikolajgrzyb](https://github.com/mikolajgrzyb)
 * @author Dag Stuan [@dagstuan](https://github.com/dagstuan)
 */
export const nb = {
  code: "nb",
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
export default nb;
