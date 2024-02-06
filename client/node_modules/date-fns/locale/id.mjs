import { formatDistance } from "./id/_lib/formatDistance.mjs";
import { formatLong } from "./id/_lib/formatLong.mjs";
import { formatRelative } from "./id/_lib/formatRelative.mjs";
import { localize } from "./id/_lib/localize.mjs";
import { match } from "./id/_lib/match.mjs";

/**
 * @category Locales
 * @summary Indonesian locale.
 * @language Indonesian
 * @iso-639-2 ind
 * @author Rahmat Budiharso [@rbudiharso](https://github.com/rbudiharso)
 * @author Benget Nata [@bentinata](https://github.com/bentinata)
 * @author Budi Irawan [@deerawan](https://github.com/deerawan)
 * @author Try Ajitiono [@imballinst](https://github.com/imballinst)
 */
export const id = {
  code: "id",
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
export default id;
