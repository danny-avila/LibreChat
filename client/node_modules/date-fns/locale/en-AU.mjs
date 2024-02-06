import { formatDistance } from "./en-US/_lib/formatDistance.mjs";
import { formatLong } from "./en-AU/_lib/formatLong.mjs";
import { formatRelative } from "./en-US/_lib/formatRelative.mjs";
import { localize } from "./en-US/_lib/localize.mjs";
import { match } from "./en-US/_lib/match.mjs";

/**
 * @category Locales
 * @summary English locale (Australia).
 * @language English
 * @iso-639-2 eng
 * @author Julien Malige [@JulienMalige](https://github.com/JulienMalige)
 */
export const enAU = {
  code: "en-AU",
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
export default enAU;
