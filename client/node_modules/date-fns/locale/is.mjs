import { formatDistance } from "./is/_lib/formatDistance.mjs";
import { formatLong } from "./is/_lib/formatLong.mjs";
import { formatRelative } from "./is/_lib/formatRelative.mjs";
import { localize } from "./is/_lib/localize.mjs";
import { match } from "./is/_lib/match.mjs";

/**
 * @category Locales
 * @summary Icelandic locale.
 * @language Icelandic
 * @iso-639-2 isl
 * @author Derek Blank [@derekblank](https://github.com/derekblank)
 * @author Arnór Ýmir [@lamayg](https://github.com/lamayg)
 */
export const is = {
  code: "is",
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
export default is;
