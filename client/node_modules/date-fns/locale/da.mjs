import { formatDistance } from "./da/_lib/formatDistance.mjs";
import { formatLong } from "./da/_lib/formatLong.mjs";
import { formatRelative } from "./da/_lib/formatRelative.mjs";
import { localize } from "./da/_lib/localize.mjs";
import { match } from "./da/_lib/match.mjs";

/**
 * @category Locales
 * @summary Danish locale.
 * @language Danish
 * @iso-639-2 dan
 * @author Mathias Wøbbe [@MathiasKandelborg](https://github.com/MathiasKandelborg)
 * @author Anders B. Hansen [@Andersbiha](https://github.com/Andersbiha)
 * @author [@kgram](https://github.com/kgram)
 * @author [@stefanbugge](https://github.com/stefanbugge)
 */
export const da = {
  code: "da",
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
export default da;
