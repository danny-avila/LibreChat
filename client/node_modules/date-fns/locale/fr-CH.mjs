// Same as fr
import { formatDistance } from "./fr/_lib/formatDistance.mjs";
import { localize } from "./fr/_lib/localize.mjs";
import { match } from "./fr/_lib/match.mjs";

// Unique for fr-CH
import { formatLong } from "./fr-CH/_lib/formatLong.mjs";
import { formatRelative } from "./fr-CH/_lib/formatRelative.mjs";

/**
 * @category Locales
 * @summary French locale (Switzerland).
 * @language French
 * @iso-639-2 fra
 * @author Jean Dupouy [@izeau](https://github.com/izeau)
 * @author François B [@fbonzon](https://github.com/fbonzon)
 * @author Van Vuong Ngo [@vanvuongngo](https://github.com/vanvuongngo)
 * @author Alex Hoeing [@dcbn](https://github.com/dcbn)
 */
export const frCH = {
  code: "fr-CH",
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
export default frCH;
