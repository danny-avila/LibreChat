import { formatDistance } from "./hu/_lib/formatDistance.mjs";
import { formatLong } from "./hu/_lib/formatLong.mjs";
import { formatRelative } from "./hu/_lib/formatRelative.mjs";
import { localize } from "./hu/_lib/localize.mjs";
import { match } from "./hu/_lib/match.mjs";

/**
 * @category Locales
 * @summary Hungarian locale.
 * @language Hungarian
 * @iso-639-2 hun
 * @author Pavlo Shpak [@pshpak](https://github.com/pshpak)
 * @author Eduardo Pardo [@eduardopsll](https://github.com/eduardopsll)
 * @author Zoltan Szepesi [@twodcube](https://github.com/twodcube)
 */
export const hu = {
  code: "hu",
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
export default hu;
