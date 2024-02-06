import { formatDistance } from "./ca/_lib/formatDistance.mjs";
import { formatLong } from "./ca/_lib/formatLong.mjs";
import { formatRelative } from "./ca/_lib/formatRelative.mjs";
import { localize } from "./ca/_lib/localize.mjs";
import { match } from "./ca/_lib/match.mjs";

/**
 * @category Locales
 * @summary Catalan locale.
 * @language Catalan
 * @iso-639-2 cat
 * @author Guillermo Grau [@guigrpa](https://github.com/guigrpa)
 * @author Alex Vizcaino [@avizcaino](https://github.com/avizcaino)
 */
export const ca = {
  code: "ca",
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
export default ca;
