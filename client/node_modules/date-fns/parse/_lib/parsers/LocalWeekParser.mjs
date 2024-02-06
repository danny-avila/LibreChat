import { setWeek } from "../../../setWeek.mjs";
import { startOfWeek } from "../../../startOfWeek.mjs";
import { numericPatterns } from "../constants.mjs";
import { Parser } from "../Parser.mjs";
import { parseNDigits, parseNumericPattern } from "../utils.mjs";

// Local week of year
export class LocalWeekParser extends Parser {
  priority = 100;

  parse(dateString, token, match) {
    switch (token) {
      case "w":
        return parseNumericPattern(numericPatterns.week, dateString);
      case "wo":
        return match.ordinalNumber(dateString, { unit: "week" });
      default:
        return parseNDigits(token.length, dateString);
    }
  }

  validate(_date, value) {
    return value >= 1 && value <= 53;
  }

  set(date, _flags, value, options) {
    return startOfWeek(setWeek(date, value, options), options);
  }

  incompatibleTokens = [
    "y",
    "R",
    "u",
    "q",
    "Q",
    "M",
    "L",
    "I",
    "d",
    "D",
    "i",
    "t",
    "T",
  ];
}
