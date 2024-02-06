import { formatDistance } from "./ar-SA/_lib/formatDistance.mjs";
import { formatLong } from "./ar-SA/_lib/formatLong.mjs";
import { formatRelative } from "./ar-SA/_lib/formatRelative.mjs";
import { localize } from "./ar-SA/_lib/localize.mjs";
import { match } from "./ar-SA/_lib/match.mjs";

/**
 * @category Locales
 * @summary Arabic locale (Sauid Arabic).
 * @language Arabic
 * @iso-639-2 ara
 * @author Dhaifallah Alwadani [@dalwadani](https://github.com/dalwadani)
 */
export const arSA = {
  code: "ar-SA",
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
export default arSA;
