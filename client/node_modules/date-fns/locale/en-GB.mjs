import { formatDistance } from "./en-US/_lib/formatDistance.mjs";
import { formatRelative } from "./en-US/_lib/formatRelative.mjs";
import { localize } from "./en-US/_lib/localize.mjs";
import { match } from "./en-US/_lib/match.mjs";
import { formatLong } from "./en-GB/_lib/formatLong.mjs";

/**
 * @category Locales
 * @summary English locale (United Kingdom).
 * @language English
 * @iso-639-2 eng
 * @author Alex [@glintik](https://github.com/glintik)
 */
export const enGB = {
  code: "en-GB",
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
export default enGB;
