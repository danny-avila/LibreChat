import { constructFrom } from "../../../constructFrom.mjs";
import { Parser } from "../Parser.mjs";
import { parseAnyDigitsSigned } from "../utils.mjs";

export class TimestampSecondsParser extends Parser {
  priority = 40;

  parse(dateString) {
    return parseAnyDigitsSigned(dateString);
  }

  set(date, _flags, value) {
    return [constructFrom(date, value * 1000), { timestampIsSet: true }];
  }

  incompatibleTokens = "*";
}
