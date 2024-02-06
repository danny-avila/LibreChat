import { formatDistance } from "./sq/_lib/formatDistance.mjs";
import { formatLong } from "./sq/_lib/formatLong.mjs";
import { formatRelative } from "./sq/_lib/formatRelative.mjs";
import { localize } from "./sq/_lib/localize.mjs";
import { match } from "./sq/_lib/match.mjs";

/**
 * @category Locales
 * @summary Albanian locale.
 * @language Shqip
 * @iso-639-2 sqi
 * @author Ardit Dine [@arditdine](https://github.com/arditdine)
 */
export const sq = {
  code: "sq",
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
export default sq;
