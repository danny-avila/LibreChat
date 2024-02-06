import { formatDistance } from "./en-US/_lib/formatDistance.mjs";
import { formatRelative } from "./en-US/_lib/formatRelative.mjs";
import { localize } from "./en-US/_lib/localize.mjs";
import { match } from "./en-US/_lib/match.mjs";
import { formatLong } from "./en-NZ/_lib/formatLong.mjs";

/**
 * @category Locales
 * @summary English locale (New Zealand).
 * @language English
 * @iso-639-2 eng
 * @author Murray Lucas [@muntact](https://github.com/muntact)
 */
export const enNZ = {
  code: "en-NZ",
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
export default enNZ;
