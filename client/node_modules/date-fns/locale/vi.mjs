import { formatDistance } from "./vi/_lib/formatDistance.mjs";
import { formatLong } from "./vi/_lib/formatLong.mjs";
import { formatRelative } from "./vi/_lib/formatRelative.mjs";
import { localize } from "./vi/_lib/localize.mjs";
import { match } from "./vi/_lib/match.mjs";

/**
 * @category Locales
 * @summary Vietnamese locale (Vietnam).
 * @language Vietnamese
 * @iso-639-2 vie
 * @author Thanh Tran [@trongthanh](https://github.com/trongthanh)
 * @author Leroy Hopson [@lihop](https://github.com/lihop)
 */
export const vi = {
  code: "vi",
  formatDistance: formatDistance,
  formatLong: formatLong,
  formatRelative: formatRelative,
  localize: localize,
  match: match,
  options: {
    weekStartsOn: 1 /* Monday */,
    firstWeekContainsDate: 1 /* First week of new year contains Jan 1st  */,
  },
};

// Fallback for modularized imports:
export default vi;
