"use strict";
exports.beTarask = void 0;
var _index = require("./be-tarask/_lib/formatDistance.js");
var _index2 = require("./be-tarask/_lib/formatLong.js");
var _index3 = require("./be-tarask/_lib/formatRelative.js");
var _index4 = require("./be-tarask/_lib/localize.js");
var _index5 = require("./be-tarask/_lib/match.js");

/**
 * @category Locales
 * @summary Belarusian Classic locale.
 * @language Belarusian Classic
 * @iso-639-2 bel
 * @author Ryhor Nopears [@nopears](https://github.com/nopears)
 */
const beTarask = (exports.beTarask = {
  code: "be-tarask",
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
