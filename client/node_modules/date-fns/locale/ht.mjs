import { formatDistance } from "./ht/_lib/formatDistance.mjs";
import { formatLong } from "./ht/_lib/formatLong.mjs";
import { formatRelative } from "./ht/_lib/formatRelative.mjs";
import { localize } from "./ht/_lib/localize.mjs";
import { match } from "./ht/_lib/match.mjs";

/**
 * @category Locales
 * @summary Haitian Creole locale.
 * @language Haitian Creole
 * @iso-639-2 hat
 * @author Rubens Mariuzzo [@rmariuzzo](https://github.com/rmariuzzo)
 * @author Watson Marcelain [@watsongm24](https://github.com/watsongm24)
 */
export const ht = {
  code: "ht",
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
export default ht;
