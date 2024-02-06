import { formatDistance } from "./mk/_lib/formatDistance.mjs";
import { formatLong } from "./mk/_lib/formatLong.mjs";
import { formatRelative } from "./mk/_lib/formatRelative.mjs";
import { localize } from "./mk/_lib/localize.mjs";
import { match } from "./mk/_lib/match.mjs";

/**
 * @category Locales
 * @summary Macedonian locale.
 * @language Macedonian
 * @iso-639-2 mkd
 * @author Petar Vlahu [@vlahupetar](https://github.com/vlahupetar)
 * @author Altrim Beqiri [@altrim](https://github.com/altrim)
 */
export const mk = {
  code: "mk",
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
export default mk;
