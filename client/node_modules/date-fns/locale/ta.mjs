import { formatDistance } from "./ta/_lib/formatDistance.mjs";
import { formatLong } from "./ta/_lib/formatLong.mjs";
import { formatRelative } from "./ta/_lib/formatRelative.mjs";
import { localize } from "./ta/_lib/localize.mjs";
import { match } from "./ta/_lib/match.mjs";

/**
 * @category Locales
 * @summary Tamil locale (India).
 * @language Tamil
 * @iso-639-2 tam
 * @author Sibiraj [@sibiraj-s](https://github.com/sibiraj-s)
 */
export const ta = {
  code: "ta",
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
export default ta;
