import { formatDistance } from "./ko/_lib/formatDistance.mjs";
import { formatLong } from "./ko/_lib/formatLong.mjs";
import { formatRelative } from "./ko/_lib/formatRelative.mjs";
import { localize } from "./ko/_lib/localize.mjs";
import { match } from "./ko/_lib/match.mjs";

/**
 * @category Locales
 * @summary Korean locale.
 * @language Korean
 * @iso-639-2 kor
 * @author Hong Chulju [@angdev](https://github.com/angdev)
 * @author Lee Seoyoen [@iamssen](https://github.com/iamssen)
 * @author Taiki IKeda [@so99ynoodles](https://github.com/so99ynoodles)
 */
export const ko = {
  code: "ko",
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
export default ko;
