import { formatDistance } from "./sr/_lib/formatDistance.mjs";
import { formatLong } from "./sr/_lib/formatLong.mjs";
import { formatRelative } from "./sr/_lib/formatRelative.mjs";
import { localize } from "./sr/_lib/localize.mjs";
import { match } from "./sr/_lib/match.mjs";

/**
 * @category Locales
 * @summary Serbian cyrillic locale.
 * @language Serbian
 * @iso-639-2 srp
 * @author Igor Radivojević [@rogyvoje](https://github.com/rogyvoje)
 */
export const sr = {
  code: "sr",
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
export default sr;
