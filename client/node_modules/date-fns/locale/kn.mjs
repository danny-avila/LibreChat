import { formatDistance } from "./kn/_lib/formatDistance.mjs";
import { formatLong } from "./kn/_lib/formatLong.mjs";
import { formatRelative } from "./kn/_lib/formatRelative.mjs";
import { localize } from "./kn/_lib/localize.mjs";
import { match } from "./kn/_lib/match.mjs";

/**
 * @category Locales
 * @summary Kannada locale (India).
 * @language Kannada
 * @iso-639-2 kan
 * @author Manjunatha Gouli [@developergouli](https://github.com/developergouli)
 */
export const kn = {
  code: "kn",
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
export default kn;
