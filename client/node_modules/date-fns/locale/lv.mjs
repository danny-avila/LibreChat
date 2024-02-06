import { formatDistance } from "./lv/_lib/formatDistance.mjs";
import { formatLong } from "./lv/_lib/formatLong.mjs";
import { formatRelative } from "./lv/_lib/formatRelative.mjs";
import { localize } from "./lv/_lib/localize.mjs";
import { match } from "./lv/_lib/match.mjs";

/**
 * @category Locales
 * @summary Latvian locale (Latvia).
 * @language Latvian
 * @iso-639-2 lav
 * @author Rūdolfs Puķītis [@prudolfs](https://github.com/prudolfs)
 */
export const lv = {
  code: "lv",
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
export default lv;
