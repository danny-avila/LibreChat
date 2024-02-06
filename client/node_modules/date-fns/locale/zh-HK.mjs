import { formatDistance } from "./zh-HK/_lib/formatDistance.mjs";
import { formatLong } from "./zh-HK/_lib/formatLong.mjs";
import { formatRelative } from "./zh-HK/_lib/formatRelative.mjs";
import { localize } from "./zh-HK/_lib/localize.mjs";
import { match } from "./zh-HK/_lib/match.mjs";

/**
 * @category Locales
 * @summary Chinese Traditional locale.
 * @language Chinese Traditional
 * @iso-639-2 zho
 * @author Gary Ip [@gaplo](https://github.com/gaplo)
 */
export const zhHK = {
  code: "zh-HK",
  formatDistance: formatDistance,
  formatLong: formatLong,
  formatRelative: formatRelative,
  localize: localize,
  match: match,
  options: {
    weekStartsOn: 0 /* Sunday */,
    firstWeekContainsDate: 1,
  },
};

// Fallback for modularized imports:
export default zhHK;
