import { formatDistance } from "./pt/_lib/formatDistance.mjs";
import { formatLong } from "./pt/_lib/formatLong.mjs";
import { formatRelative } from "./pt/_lib/formatRelative.mjs";
import { localize } from "./pt/_lib/localize.mjs";
import { match } from "./pt/_lib/match.mjs";

/**
 * @category Locales
 * @summary Portuguese locale.
 * @language Portuguese
 * @iso-639-2 por
 * @author Dário Freire [@dfreire](https://github.com/dfreire)
 * @author Adrián de la Rosa [@adrm](https://github.com/adrm)
 */
export const pt = {
  code: "pt",
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
export default pt;
