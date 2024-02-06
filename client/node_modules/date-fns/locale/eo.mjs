import { formatDistance } from "./eo/_lib/formatDistance.mjs";
import { formatLong } from "./eo/_lib/formatLong.mjs";
import { formatRelative } from "./eo/_lib/formatRelative.mjs";
import { localize } from "./eo/_lib/localize.mjs";
import { match } from "./eo/_lib/match.mjs";

/**
 * @category Locales
 * @summary Esperanto locale.
 * @language Esperanto
 * @iso-639-2 epo
 * @author date-fns
 */
export const eo = {
  code: "eo",
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
export default eo;
