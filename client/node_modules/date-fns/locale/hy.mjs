import { formatDistance } from "./hy/_lib/formatDistance.mjs";
import { formatLong } from "./hy/_lib/formatLong.mjs";
import { formatRelative } from "./hy/_lib/formatRelative.mjs";
import { localize } from "./hy/_lib/localize.mjs";
import { match } from "./hy/_lib/match.mjs";

/**
 * @category Locales
 * @summary Armenian locale
 * @language Armenian
 * @iso-639-2 arm
 * @author Alex Igityan [@alexigityan](https://github.com/alexigityan)
 */
export const hy = {
  code: "hy",
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
export default hy;
