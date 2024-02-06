import { formatDistance } from "./zh-TW/_lib/formatDistance.mjs";
import { formatLong } from "./zh-TW/_lib/formatLong.mjs";
import { formatRelative } from "./zh-TW/_lib/formatRelative.mjs";
import { localize } from "./zh-TW/_lib/localize.mjs";
import { match } from "./zh-TW/_lib/match.mjs";

/**
 * @category Locales
 * @summary Chinese Traditional locale.
 * @language Chinese Traditional
 * @iso-639-2 zho
 * @author tonypai [@tpai](https://github.com/tpai)
 * @author Jack Hsu [@jackhsu978](https://github.com/jackhsu978)
 * @author Terrence Lam [@skyuplam](https://github.com/skyuplam)
 */
export const zhTW = {
  code: "zh-TW",
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
export default zhTW;
