import { formatDistance } from "./ja/_lib/formatDistance.mjs";
import { formatLong } from "./ja/_lib/formatLong.mjs";
import { formatRelative } from "./ja/_lib/formatRelative.mjs";
import { localize } from "./ja/_lib/localize.mjs";
import { match } from "./ja/_lib/match.mjs";

/**
 * @category Locales
 * @summary Japanese locale.
 * @language Japanese
 * @iso-639-2 jpn
 * @author Thomas Eilmsteiner [@DeMuu](https://github.com/DeMuu)
 * @author Yamagishi Kazutoshi [@ykzts](https://github.com/ykzts)
 * @author Luca Ban [@mesqueeb](https://github.com/mesqueeb)
 * @author Terrence Lam [@skyuplam](https://github.com/skyuplam)
 * @author Taiki IKeda [@so99ynoodles](https://github.com/so99ynoodles)
 */
export const ja = {
  code: "ja",
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
export default ja;
