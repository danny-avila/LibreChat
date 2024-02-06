import { formatDistance } from "./nl/_lib/formatDistance.mjs";
import { formatLong } from "./nl/_lib/formatLong.mjs";
import { formatRelative } from "./nl/_lib/formatRelative.mjs";
import { localize } from "./nl/_lib/localize.mjs";
import { match } from "./nl/_lib/match.mjs";

/**
 * @category Locales
 * @summary Dutch locale.
 * @language Dutch
 * @iso-639-2 nld
 * @author Jorik Tangelder [@jtangelder](https://github.com/jtangelder)
 * @author Ruben Stolk [@rubenstolk](https://github.com/rubenstolk)
 * @author Lode Vanhove [@bitcrumb](https://github.com/bitcrumb)
 * @author Edo Rivai [@edorivai](https://github.com/edorivai)
 * @author Niels Keurentjes [@curry684](https://github.com/curry684)
 * @author Stefan Vermaas [@stefanvermaas](https://github.com/stefanvermaas)
 */
export const nl = {
  code: "nl",
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
export default nl;
