import { formatDistance } from "./ja-Hira/_lib/formatDistance.mjs";
import { formatLong } from "./ja-Hira/_lib/formatLong.mjs";
import { formatRelative } from "./ja-Hira/_lib/formatRelative.mjs";
import { localize } from "./ja-Hira/_lib/localize.mjs";
import { match } from "./ja-Hira/_lib/match.mjs";

/**
 * @category Locales
 * @summary Japanese (Hiragana) locale.
 * @language Japanese (Hiragana)
 * @iso-639-2 jpn
 * @author Eri Hiramatsu [@Eritutteo](https://github.com/Eritutteo)
 */
export const jaHira = {
  code: "ja-Hira",
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
export default jaHira;
