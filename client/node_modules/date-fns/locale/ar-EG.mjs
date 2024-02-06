import { formatDistance } from "./ar-EG/_lib/formatDistance.mjs";
import { formatLong } from "./ar-EG/_lib/formatLong.mjs";
import { formatRelative } from "./ar-EG/_lib/formatRelative.mjs";
import { localize } from "./ar-EG/_lib/localize.mjs";
import { match } from "./ar-EG/_lib/match.mjs";

/**
 * @category Locales
 * @summary Arabic locale (Egypt).
 * @language Arabic
 * @iso-639-2 ara
 * @author AbdAllah AbdElFattah [@AbdAllahAbdElFattah13](https://github.com/AbdAllahAbdElFattah13)
 */
export const arEG = {
  code: "ar-EG",
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
export default arEG;
