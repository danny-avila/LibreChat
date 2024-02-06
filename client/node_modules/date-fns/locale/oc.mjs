import { formatDistance } from "./oc/_lib/formatDistance.mjs";
import { formatLong } from "./oc/_lib/formatLong.mjs";
import { formatRelative } from "./oc/_lib/formatRelative.mjs";
import { localize } from "./oc/_lib/localize.mjs";
import { match } from "./oc/_lib/match.mjs";

/**
 * @category Locales
 * @summary Occitan locale.
 * @language Occitan
 * @iso-639-2 oci
 * @author Quentin PAGÈS
 */
export const oc = {
  code: "oc",
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
export default oc;
