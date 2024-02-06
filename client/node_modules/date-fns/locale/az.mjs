import { formatDistance } from "./az/_lib/formatDistance.mjs";
import { formatLong } from "./az/_lib/formatLong.mjs";
import { formatRelative } from "./az/_lib/formatRelative.mjs";
import { localize } from "./az/_lib/localize.mjs";
import { match } from "./az/_lib/match.mjs";

/**
 * @category Locales
 * @summary Azerbaijani locale.
 * @language Azerbaijani
 * @iso-639-2 aze
 */

export const az = {
  code: "az",
  formatDistance: formatDistance,
  formatLong: formatLong,
  formatRelative: formatRelative,
  localize: localize,
  match: match,
  options: {
    weekStartsOn: 1,
    firstWeekContainsDate: 1,
  },
};

// Fallback for modularized imports:
export default az;
