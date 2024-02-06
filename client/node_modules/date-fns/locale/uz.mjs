import { formatDistance } from "./uz/_lib/formatDistance.mjs";
import { formatLong } from "./uz/_lib/formatLong.mjs";
import { formatRelative } from "./uz/_lib/formatRelative.mjs";
import { localize } from "./uz/_lib/localize.mjs";
import { match } from "./uz/_lib/match.mjs";

/**
 * @category Locales
 * @summary Uzbek locale.
 * @language Uzbek
 * @iso-639-2 uzb
 * @author Mukhammadali [@mukhammadali](https://github.com/Mukhammadali)
 */
export const uz = {
  code: "uz",
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
export default uz;
