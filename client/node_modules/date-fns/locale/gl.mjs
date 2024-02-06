import { formatDistance } from "./gl/_lib/formatDistance.mjs";
import { formatLong } from "./gl/_lib/formatLong.mjs";
import { formatRelative } from "./gl/_lib/formatRelative.mjs";
import { localize } from "./gl/_lib/localize.mjs";
import { match } from "./gl/_lib/match.mjs";

/**
 * @category Locales
 * @summary Galician locale.
 * @language Galician
 * @iso-639-2 glg
 * @author Alberto Doval - Cocodin Technology[@cocodinTech](https://github.com/cocodinTech)
 * @author Fidel Pita [@fidelpita](https://github.com/fidelpita)
 */
export const gl = {
  code: "gl",
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
export default gl;
