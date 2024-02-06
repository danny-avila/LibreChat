import { formatDistance } from "./fi/_lib/formatDistance.mjs";
import { formatLong } from "./fi/_lib/formatLong.mjs";
import { formatRelative } from "./fi/_lib/formatRelative.mjs";
import { localize } from "./fi/_lib/localize.mjs";
import { match } from "./fi/_lib/match.mjs";

/**
 * @category Locales
 * @summary Finnish locale.
 * @language Finnish
 * @iso-639-2 fin
 * @author Pyry-Samuli Lahti [@Pyppe](https://github.com/Pyppe)
 * @author Edo Rivai [@mikolajgrzyb](https://github.com/mikolajgrzyb)
 * @author Samu Juvonen [@sjuvonen](https://github.com/sjuvonen)
 */
export const fi = {
  code: "fi",
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
export default fi;
