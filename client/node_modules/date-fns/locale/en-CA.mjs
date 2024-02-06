import { formatRelative } from "./en-US/_lib/formatRelative.mjs";
import { localize } from "./en-US/_lib/localize.mjs";
import { match } from "./en-US/_lib/match.mjs";
import { formatDistance } from "./en-CA/_lib/formatDistance.mjs";
import { formatLong } from "./en-CA/_lib/formatLong.mjs";

/**
 * @category Locales
 * @summary English locale (Canada).
 * @language English
 * @iso-639-2 eng
 * @author Mark Owsiak [@markowsiak](https://github.com/markowsiak)
 * @author Marco Imperatore [@mimperatore](https://github.com/mimperatore)
 */
export const enCA = {
  code: "en-CA",
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
export default enCA;
