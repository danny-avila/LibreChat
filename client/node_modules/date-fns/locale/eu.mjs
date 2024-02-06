import { formatDistance } from "./eu/_lib/formatDistance.mjs";
import { formatLong } from "./eu/_lib/formatLong.mjs";
import { formatRelative } from "./eu/_lib/formatRelative.mjs";
import { localize } from "./eu/_lib/localize.mjs";
import { match } from "./eu/_lib/match.mjs";

/**
 * @category Locales
 * @summary Basque locale.
 * @language Basque
 * @iso-639-2 eus
 * @author Jacob Söderblom [@JacobSoderblom](https://github.com/JacobSoderblom)
 */
export const eu = {
  code: "eu",
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
export default eu;
