import { formatDistance } from "./lt/_lib/formatDistance.mjs";
import { formatLong } from "./lt/_lib/formatLong.mjs";
import { formatRelative } from "./lt/_lib/formatRelative.mjs";
import { localize } from "./lt/_lib/localize.mjs";
import { match } from "./lt/_lib/match.mjs";

/**
 * @category Locales
 * @summary Lithuanian locale.
 * @language Lithuanian
 * @iso-639-2 lit
 * @author Pavlo Shpak [@pshpak](https://github.com/pshpak)
 * @author Eduardo Pardo [@eduardopsll](https://github.com/eduardopsll)
 */
export const lt = {
  code: "lt",
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
export default lt;
