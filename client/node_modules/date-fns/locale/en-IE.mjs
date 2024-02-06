import { formatDistance } from "./en-US/_lib/formatDistance.mjs";
import { formatRelative } from "./en-US/_lib/formatRelative.mjs";
import { localize } from "./en-US/_lib/localize.mjs";
import { match } from "./en-US/_lib/match.mjs";
import { formatLong } from "./en-GB/_lib/formatLong.mjs";

/**
 * @category Locales
 * @summary English locale (Ireland).
 * @language English
 * @iso-639-2 eng
 * @author Tetiana [@tan75](https://github.com/tan75)
 */
export const enIE = {
  code: "en-IE",
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
export default enIE;
