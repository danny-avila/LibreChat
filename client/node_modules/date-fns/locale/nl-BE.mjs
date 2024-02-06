import { formatDistance } from "./nl-BE/_lib/formatDistance.mjs";
import { formatLong } from "./nl-BE/_lib/formatLong.mjs";
import { formatRelative } from "./nl-BE/_lib/formatRelative.mjs";
import { localize } from "./nl-BE/_lib/localize.mjs";
import { match } from "./nl-BE/_lib/match.mjs";

/**
 * @category Locales
 * @summary Dutch locale.
 * @language Dutch
 * @iso-639-2 nld
 * @author Jorik Tangelder [@jtangelder](https://github.com/jtangelder)
 * @author Ruben Stolk [@rubenstolk](https://github.com/rubenstolk)
 * @author Lode Vanhove [@bitcrumb](https://github.com/bitcrumb)
 * @author Alex Hoeing [@dcbn](https://github.com/dcbn)
 */
export const nlBE = {
  code: "nl-BE",
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
export default nlBE;
