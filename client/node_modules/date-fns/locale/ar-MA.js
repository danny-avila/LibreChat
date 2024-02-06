"use strict";
exports.arMA = void 0;
var _index = require("./ar-MA/_lib/formatDistance.js");
var _index2 = require("./ar-MA/_lib/formatLong.js");
var _index3 = require("./ar-MA/_lib/formatRelative.js");
var _index4 = require("./ar-MA/_lib/localize.js");
var _index5 = require("./ar-MA/_lib/match.js");

/**
 * @category Locales
 * @summary Arabic locale (Moroccan Arabic).
 * @language Moroccan Arabic
 * @iso-639-2 ara
 * @author Achraf Rrami [@rramiachraf](https://github.com/rramiachraf)
 */
const arMA = (exports.arMA = {
  code: "ar-MA",
  formatDistance: _index.formatDistance,
  formatLong: _index2.formatLong,
  formatRelative: _index3.formatRelative,
  localize: _index4.localize,
  match: _index5.match,
  options: {
    // Monday is 1
    weekStartsOn: 1,
    firstWeekContainsDate: 1,
  },
});
