"use strict";
exports.deAT = void 0;
var _index = require("./de/_lib/formatDistance.js");
var _index2 = require("./de/_lib/formatLong.js");
var _index3 = require("./de/_lib/formatRelative.js");
var _index4 = require("./de/_lib/match.js");

var _index5 = require("./de-AT/_lib/localize.js"); // difference to 'de' locale

/**
 * @category Locales
 * @summary German locale (Austria).
 * @language German
 * @iso-639-2 deu
 * @author Christoph Tobias Stenglein [@cstenglein](https://github.com/cstenglein)
 */
const deAT = (exports.deAT = {
  code: "de-AT",
  formatDistance: _index.formatDistance,
  formatLong: _index2.formatLong,
  formatRelative: _index3.formatRelative,
  localize: _index5.localize,
  match: _index4.match,
  options: {
    weekStartsOn: 1 /* Monday */,
    firstWeekContainsDate: 4,
  },
});
