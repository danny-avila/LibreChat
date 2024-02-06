import { formatDistance } from "./ka/_lib/formatDistance.mjs";
import { formatLong } from "./ka/_lib/formatLong.mjs";
import { formatRelative } from "./ka/_lib/formatRelative.mjs";
import { localize } from "./ka/_lib/localize.mjs";
import { match } from "./ka/_lib/match.mjs";

/**
 * @category Locales
 * @summary Georgian locale.
 * @language Georgian
 * @iso-639-2 geo
 * @author Lado Lomidze [@Landish](https://github.com/Landish)
 * @author Nick Shvelidze [@shvelo](https://github.com/shvelo)
 */
export const ka = {
  code: "ka",
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
export default ka;
