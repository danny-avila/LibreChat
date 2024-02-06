import { formatDistance } from "./pt-BR/_lib/formatDistance.mjs";
import { formatLong } from "./pt-BR/_lib/formatLong.mjs";
import { formatRelative } from "./pt-BR/_lib/formatRelative.mjs";
import { localize } from "./pt-BR/_lib/localize.mjs";
import { match } from "./pt-BR/_lib/match.mjs";

/**
 * @category Locales
 * @summary Portuguese locale (Brazil).
 * @language Portuguese
 * @iso-639-2 por
 * @author Lucas Duailibe [@duailibe](https://github.com/duailibe)
 * @author Yago Carballo [@yagocarballo](https://github.com/YagoCarballo)
 */
export const ptBR = {
  code: "pt-BR",
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
export default ptBR;
