import { formatDistance } from "./mt/_lib/formatDistance.mjs";
import { formatLong } from "./mt/_lib/formatLong.mjs";
import { formatRelative } from "./mt/_lib/formatRelative.mjs";
import { localize } from "./mt/_lib/localize.mjs";
import { match } from "./mt/_lib/match.mjs";

/**
 * @category Locales
 * @summary Maltese locale.
 * @language Maltese
 * @iso-639-2 mlt
 * @author Andras Matzon [@amatzon](@link https://github.com/amatzon)
 * @author Bryan Borg [@bryanMt](@link https://github.com/bryanMt)
 */
export const mt = {
  code: "mt",
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
export default mt;
