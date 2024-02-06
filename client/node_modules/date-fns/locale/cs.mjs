import { formatDistance } from "./cs/_lib/formatDistance.mjs";
import { formatLong } from "./cs/_lib/formatLong.mjs";
import { formatRelative } from "./cs/_lib/formatRelative.mjs";
import { localize } from "./cs/_lib/localize.mjs";
import { match } from "./cs/_lib/match.mjs";

/**
 * @category Locales
 * @summary Czech locale.
 * @language Czech
 * @iso-639-2 ces
 * @author David Rus [@davidrus](https://github.com/davidrus)
 * @author Pavel Hrách [@SilenY](https://github.com/SilenY)
 * @author Jozef Bíroš [@JozefBiros](https://github.com/JozefBiros)
 */
export const cs = {
  code: "cs",
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
export default cs;
