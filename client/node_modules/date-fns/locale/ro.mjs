import { formatDistance } from "./ro/_lib/formatDistance.mjs";
import { formatLong } from "./ro/_lib/formatLong.mjs";
import { formatRelative } from "./ro/_lib/formatRelative.mjs";
import { localize } from "./ro/_lib/localize.mjs";
import { match } from "./ro/_lib/match.mjs";

/**
 * @category Locales
 * @summary Romanian locale.
 * @language Romanian
 * @iso-639-2 ron
 * @author Sergiu Munteanu [@jsergiu](https://github.com/jsergiu)
 * @author Adrian Ocneanu [@aocneanu](https://github.com/aocneanu)
 * @author Mihai Ocneanu [@gandesc](https://github.com/gandesc)
 */
export const ro = {
  code: "ro",
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
export default ro;
