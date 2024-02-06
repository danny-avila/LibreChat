import { formatDistance } from "./sl/_lib/formatDistance.mjs";
import { formatLong } from "./sl/_lib/formatLong.mjs";
import { formatRelative } from "./sl/_lib/formatRelative.mjs";
import { localize } from "./sl/_lib/localize.mjs";
import { match } from "./sl/_lib/match.mjs";

/**
 * @category Locales
 * @summary Slovenian locale.
 * @language Slovenian
 * @iso-639-2 slv
 * @author Adam Stradovnik [@Neoglyph](https://github.com/Neoglyph)
 * @author Mato Žgajner [@mzgajner](https://github.com/mzgajner)
 */
export const sl = {
  code: "sl",
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
export default sl;
