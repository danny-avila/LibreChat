import { formatDistance } from "./bs/_lib/formatDistance.mjs";
import { formatLong } from "./bs/_lib/formatLong.mjs";
import { formatRelative } from "./bs/_lib/formatRelative.mjs";
import { localize } from "./bs/_lib/localize.mjs";
import { match } from "./bs/_lib/match.mjs";

/**
 * @category Locales
 * @summary Bosnian locale.
 * @language Bosnian
 * @iso-639-2 bos
 * @author Branislav Lazić [@branislavlazic](https://github.com/branislavlazic)
 */
export const bs = {
  code: "bs",
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
export default bs;
