// Same as fr
import { formatDistance } from "./fr/_lib/formatDistance.mjs";
import { formatRelative } from "./fr/_lib/formatRelative.mjs";
import { localize } from "./fr/_lib/localize.mjs";
import { match } from "./fr/_lib/match.mjs";

// Unique for fr-CA
import { formatLong } from "./fr-CA/_lib/formatLong.mjs";

/**
 * @category Locales
 * @summary French locale (Canada).
 * @language French
 * @iso-639-2 fra
 * @author Jean Dupouy [@izeau](https://github.com/izeau)
 * @author François B [@fbonzon](https://github.com/fbonzon)
 * @author Gabriele Petrioli [@gpetrioli](https://github.com/gpetrioli)
 */
export const frCA = {
  code: "fr-CA",
  formatDistance: formatDistance,
  formatLong: formatLong,
  formatRelative: formatRelative,
  localize: localize,
  match: match,

  // Unique for fr-CA
  options: {
    weekStartsOn: 0 /* Sunday */,
    firstWeekContainsDate: 1,
  },
};

// Fallback for modularized imports:
export default frCA;
