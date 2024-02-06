import { formatDistance } from "./be/_lib/formatDistance.mjs";
import { formatLong } from "./be/_lib/formatLong.mjs";
import { formatRelative } from "./be/_lib/formatRelative.mjs";
import { localize } from "./be/_lib/localize.mjs";
import { match } from "./be/_lib/match.mjs";

/**
 * @category Locales
 * @summary Belarusian locale.
 * @language Belarusian
 * @iso-639-2 bel
 * @author Kiryl Anokhin [@alyrik](https://github.com/alyrik)
 * @author Martin Wind [@arvigeus](https://github.com/mawi12345)
 */
export const be = {
  code: "be",
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
export default be;
