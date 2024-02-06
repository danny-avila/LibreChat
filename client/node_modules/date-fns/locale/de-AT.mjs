import { formatDistance } from "./de/_lib/formatDistance.mjs";
import { formatLong } from "./de/_lib/formatLong.mjs";
import { formatRelative } from "./de/_lib/formatRelative.mjs";
import { match } from "./de/_lib/match.mjs";

// difference to 'de' locale
import { localize } from "./de-AT/_lib/localize.mjs";

/**
 * @category Locales
 * @summary German locale (Austria).
 * @language German
 * @iso-639-2 deu
 * @author Christoph Tobias Stenglein [@cstenglein](https://github.com/cstenglein)
 */
export const deAT = {
  code: "de-AT",
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
export default deAT;
