import { formatDistance } from "./th/_lib/formatDistance.mjs";
import { formatLong } from "./th/_lib/formatLong.mjs";
import { formatRelative } from "./th/_lib/formatRelative.mjs";
import { localize } from "./th/_lib/localize.mjs";
import { match } from "./th/_lib/match.mjs";

/**
 * @category Locales
 * @summary Thai locale.
 * @language Thai
 * @iso-639-2 tha
 * @author Athiwat Hirunworawongkun [@athivvat](https://github.com/athivvat)
 * @author [@hawkup](https://github.com/hawkup)
 * @author  Jirawat I. [@nodtem66](https://github.com/nodtem66)
 */
export const th = {
  code: "th",
  formatDistance: formatDistance,
  formatLong: formatLong,
  formatRelative: formatRelative,
  localize: localize,
  match: match,
  options: {
    weekStartsOn: 0 /* Sunday */,
    firstWeekContainsDate: 1,
  },
};

// Fallback for modularized imports:
export default th;
