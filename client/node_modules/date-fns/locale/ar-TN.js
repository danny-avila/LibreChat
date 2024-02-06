"use strict";
exports.arTN = void 0;
var _index = require("./ar-TN/_lib/formatDistance.js");
var _index2 = require("./ar-TN/_lib/formatLong.js");
var _index3 = require("./ar-TN/_lib/formatRelative.js");
var _index4 = require("./ar-TN/_lib/localize.js");
var _index5 = require("./ar-TN/_lib/match.js");

/**
 * @category Locales
 * @summary Arabic locale (Tunisian Arabic).
 * @language Arabic
 * @iso-639-2 ara
 * @author Koussay Haj Kacem [@essana3](https://github.com/essana3)
 */
const arTN = (exports.arTN = {
  code: "ar-TN",
  formatDistance: _index.formatDistance,
  formatLong: _index2.formatLong,
  formatRelative: _index3.formatRelative,
  localize: _index4.localize,
  match: _index5.match,
  options: {
    weekStartsOn: 1 /* Monday */,
    firstWeekContainsDate: 1,
  },
});
