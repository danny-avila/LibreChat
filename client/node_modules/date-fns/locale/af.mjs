import { formatDistance } from "./af/_lib/formatDistance.mjs";
import { formatLong } from "./af/_lib/formatLong.mjs";
import { formatRelative } from "./af/_lib/formatRelative.mjs";
import { localize } from "./af/_lib/localize.mjs";
import { match } from "./af/_lib/match.mjs";

/**
 * @category Locales
 * @summary Afrikaans locale.
 * @language Afrikaans
 * @iso-639-2 afr
 * @author Marnus Weststrate [@marnusw](https://github.com/marnusw)
 */
export const af = {
  code: "af",
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
export default af;
