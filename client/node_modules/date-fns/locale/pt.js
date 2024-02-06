"use strict";
exports.pt = void 0;
var _index = require("./pt/_lib/formatDistance.js");
var _index2 = require("./pt/_lib/formatLong.js");
var _index3 = require("./pt/_lib/formatRelative.js");
var _index4 = require("./pt/_lib/localize.js");
var _index5 = require("./pt/_lib/match.js");

/**
 * @category Locales
 * @summary Portuguese locale.
 * @language Portuguese
 * @iso-639-2 por
 * @author Dário Freire [@dfreire](https://github.com/dfreire)
 * @author Adrián de la Rosa [@adrm](https://github.com/adrm)
 */
const pt = (exports.pt = {
  code: "pt",
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
