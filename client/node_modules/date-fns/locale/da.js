"use strict";
exports.da = void 0;
var _index = require("./da/_lib/formatDistance.js");
var _index2 = require("./da/_lib/formatLong.js");
var _index3 = require("./da/_lib/formatRelative.js");
var _index4 = require("./da/_lib/localize.js");
var _index5 = require("./da/_lib/match.js");

/**
 * @category Locales
 * @summary Danish locale.
 * @language Danish
 * @iso-639-2 dan
 * @author Mathias Wøbbe [@MathiasKandelborg](https://github.com/MathiasKandelborg)
 * @author Anders B. Hansen [@Andersbiha](https://github.com/Andersbiha)
 * @author [@kgram](https://github.com/kgram)
 * @author [@stefanbugge](https://github.com/stefanbugge)
 */
const da = (exports.da = {
  code: "da",
  formatDistance: _index.formatDistance,
  formatLong: _index2.formatLong,
  formatRelative: _index3.formatRelative,
  localize: _index4.localize,
  match: _index5.match,
  options: {
    weekStartsOn: 1 /* Monday */,
    firstWeekContainsDate: 4,
  },
});
