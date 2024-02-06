import { formatDistance } from "./fa-IR/_lib/formatDistance.mjs";
import { formatLong } from "./fa-IR/_lib/formatLong.mjs";
import { formatRelative } from "./fa-IR/_lib/formatRelative.mjs";
import { localize } from "./fa-IR/_lib/localize.mjs";
import { match } from "./fa-IR/_lib/match.mjs";

/**
 * @category Locales
 * @summary Persian/Farsi locale (Iran).
 * @language Persian
 * @iso-639-2 ira
 * @author Morteza Ziyae [@mort3za](https://github.com/mort3za)
 */
export const faIR = {
  code: "fa-IR",
  formatDistance: formatDistance,
  formatLong: formatLong,
  formatRelative: formatRelative,
  localize: localize,
  match: match,
  options: {
    weekStartsOn: 6 /* Saturday */,
    firstWeekContainsDate: 1,
  },
};

// Fallback for modularized imports:
export default faIR;
