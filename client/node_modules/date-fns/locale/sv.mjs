import { formatDistance } from "./sv/_lib/formatDistance.mjs";
import { formatLong } from "./sv/_lib/formatLong.mjs";
import { formatRelative } from "./sv/_lib/formatRelative.mjs";
import { localize } from "./sv/_lib/localize.mjs";
import { match } from "./sv/_lib/match.mjs";

/**
 * @category Locales
 * @summary Swedish locale.
 * @language Swedish
 * @iso-639-2 swe
 * @author Johannes Ulén [@ejulen](https://github.com/ejulen)
 * @author Alexander Nanberg [@alexandernanberg](https://github.com/alexandernanberg)
 * @author Henrik Andersson [@limelights](https://github.com/limelights)
 */
export const sv = {
  code: "sv",
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
export default sv;
