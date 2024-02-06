import { formatDistance } from "./gu/_lib/formatDistance.mjs";
import { formatLong } from "./gu/_lib/formatLong.mjs";
import { formatRelative } from "./gu/_lib/formatRelative.mjs";
import { localize } from "./gu/_lib/localize.mjs";
import { match } from "./gu/_lib/match.mjs";

/**
 * @category Locales
 * @summary Gujarati locale (India).
 * @language Gujarati
 * @iso-639-2 guj
 * @author Manaday Mavani [@ManadayM](https://github.com/manadaym)
 */
export const gu = {
  code: "gu",
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
export default gu;
