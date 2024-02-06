import { formatDistance } from "./bg/_lib/formatDistance.mjs";
import { formatLong } from "./bg/_lib/formatLong.mjs";
import { formatRelative } from "./bg/_lib/formatRelative.mjs";
import { localize } from "./bg/_lib/localize.mjs";
import { match } from "./bg/_lib/match.mjs";

/**
 * @category Locales
 * @summary Bulgarian locale.
 * @language Bulgarian
 * @iso-639-2 bul
 * @author Nikolay Stoynov [@arvigeus](https://github.com/arvigeus)
 * @author Tsvetan Ovedenski [@fintara](https://github.com/fintara)
 */
export const bg = {
  code: "bg",
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
export default bg;
