import { formatDistance } from "./fr/_lib/formatDistance.mjs";
import { formatLong } from "./fr/_lib/formatLong.mjs";
import { formatRelative } from "./fr/_lib/formatRelative.mjs";
import { localize } from "./fr/_lib/localize.mjs";
import { match } from "./fr/_lib/match.mjs";

/**
 * @category Locales
 * @summary French locale.
 * @language French
 * @iso-639-2 fra
 * @author Jean Dupouy [@izeau](https://github.com/izeau)
 * @author François B [@fbonzon](https://github.com/fbonzon)
 */
export const fr = {
  code: "fr",
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
export default fr;
