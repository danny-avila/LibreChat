import { formatDistance } from "./gd/_lib/formatDistance.mjs";
import { formatLong } from "./gd/_lib/formatLong.mjs";
import { formatRelative } from "./gd/_lib/formatRelative.mjs";
import { localize } from "./gd/_lib/localize.mjs";
import { match } from "./gd/_lib/match.mjs";

/**
 * @category Locales
 * @summary Scottish Gaelic.
 * @language Scottish Gaelic
 * @iso-639-2 gla
 * @author Lee Driscoll [@leedriscoll](https://github.com/leedriscoll)
 */
export const gd = {
  code: "gd",
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
export default gd;
