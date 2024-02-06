import { formatDistance } from "./mn/_lib/formatDistance.mjs";
import { formatLong } from "./mn/_lib/formatLong.mjs";
import { formatRelative } from "./mn/_lib/formatRelative.mjs";
import { localize } from "./mn/_lib/localize.mjs";
import { match } from "./mn/_lib/match.mjs";

/**
 * @category Locales
 * @summary Mongolian locale.
 * @language Mongolian
 * @iso-639-2 mon
 * @author Bilguun Ochirbat [@bilguun0203](https://github.com/bilguun0203)
 */
export const mn = {
  code: "mn",
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
export default mn;
