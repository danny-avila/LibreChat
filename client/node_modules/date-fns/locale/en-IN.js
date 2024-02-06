"use strict";
exports.enIN = void 0;
var _index = require("./en-US/_lib/formatDistance.js");
var _index2 = require("./en-US/_lib/formatRelative.js");
var _index3 = require("./en-US/_lib/localize.js");
var _index4 = require("./en-US/_lib/match.js");

var _index5 = require("./en-IN/_lib/formatLong.js");

/**
 * @category Locales
 * @summary English locale (India).
 * @language English
 * @iso-639-2 eng
 * @author Galeel Bhasha Satthar [@gbhasha](https://github.com/gbhasha)
 */
const enIN = (exports.enIN = {
  code: "en-IN",
  formatDistance: _index.formatDistance,
  formatLong: _index5.formatLong,
  formatRelative: _index2.formatRelative,
  localize: _index3.localize,
  match: _index4.match,
  options: {
    weekStartsOn: 1, // Monday is the first day of the week.
    firstWeekContainsDate: 4, // The week that contains Jan 4th is the first week of the year.
  },
});
