import { formatDistance } from "./uz-Cyrl/_lib/formatDistance.mjs";
import { formatLong } from "./uz-Cyrl/_lib/formatLong.mjs";
import { formatRelative } from "./uz-Cyrl/_lib/formatRelative.mjs";
import { localize } from "./uz-Cyrl/_lib/localize.mjs";
import { match } from "./uz-Cyrl/_lib/match.mjs";

/**
 * @category Locales
 * @summary Uzbek Cyrillic locale.
 * @language Uzbek
 * @iso-639-2 uzb
 * @author Kamronbek Shodmonov [@kamronbek28](https://github.com/kamronbek28)
 */
export const uzCyrl = {
  code: "uz-Cyrl",
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
export default uzCyrl;
