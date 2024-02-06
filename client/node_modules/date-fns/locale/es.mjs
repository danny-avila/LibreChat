import { formatDistance } from "./es/_lib/formatDistance.mjs";
import { formatLong } from "./es/_lib/formatLong.mjs";
import { formatRelative } from "./es/_lib/formatRelative.mjs";
import { localize } from "./es/_lib/localize.mjs";
import { match } from "./es/_lib/match.mjs";

/**
 * @category Locales
 * @summary Spanish locale.
 * @language Spanish
 * @iso-639-2 spa
 * @author Juan Angosto [@juanangosto](https://github.com/juanangosto)
 * @author Guillermo Grau [@guigrpa](https://github.com/guigrpa)
 * @author Fernando Agüero [@fjaguero](https://github.com/fjaguero)
 * @author Gastón Haro [@harogaston](https://github.com/harogaston)
 * @author Yago Carballo [@YagoCarballo](https://github.com/YagoCarballo)
 */
export const es = {
  code: "es",
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
export default es;
