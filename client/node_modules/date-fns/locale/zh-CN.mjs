import { formatDistance } from "./zh-CN/_lib/formatDistance.mjs";
import { formatLong } from "./zh-CN/_lib/formatLong.mjs";
import { formatRelative } from "./zh-CN/_lib/formatRelative.mjs";
import { localize } from "./zh-CN/_lib/localize.mjs";
import { match } from "./zh-CN/_lib/match.mjs";

/**
 * @category Locales
 * @summary Chinese Simplified locale.
 * @language Chinese Simplified
 * @iso-639-2 zho
 * @author Changyu Geng [@KingMario](https://github.com/KingMario)
 * @author Song Shuoyun [@fnlctrl](https://github.com/fnlctrl)
 * @author sabrinaM [@sabrinamiao](https://github.com/sabrinamiao)
 * @author Carney Wu [@cubicwork](https://github.com/cubicwork)
 * @author Terrence Lam [@skyuplam](https://github.com/skyuplam)
 */
export const zhCN = {
  code: "zh-CN",
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
export default zhCN;
