import { constructFrom } from "../../../constructFrom.mjs";
import { Parser } from "../Parser.mjs";
import { parseAnyDigitsSigned } from "../utils.mjs";

export class TimestampMillisecondsParser extends Parser {
  priority = 20;

  parse(dateString) {
    return parseAnyDigitsSigned(dateString);
  }

  set(date, _flags, value) {
    return [constructFrom(date, value), { timestampIsSet: true }];
  }

  incompatibleTokens = "*";
}
