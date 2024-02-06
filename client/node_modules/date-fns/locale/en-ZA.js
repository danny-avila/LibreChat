"use strict";
exports.enZA = void 0;
var _index = require("./en-US/_lib/formatDistance.js");
var _index2 = require("./en-US/_lib/formatRelative.js");
var _index3 = require("./en-US/_lib/localize.js");
var _index4 = require("./en-US/_lib/match.js");

var _index5 = require("./en-ZA/_lib/formatLong.js");

/**
 * @category Locales
 * @summary English locale (South Africa).
 * @language English
 * @iso-639-2 eng
 * @author Shaila Kavrakova [@shaykav](https://github.com/shaykav)
 */
const enZA = (exports.enZA = {
  code: "en-ZA",
  formatDistance: _index.formatDistance,
  formatLong: _index5.formatLong,
  formatRelative: _index2.formatRelative,
  localize: _index3.localize,
  match: _index4.match,
  options: {
    weekStartsOn: 0, // Sunday is the first day of the week.
    firstWeekContainsDate: 1, // The week that contains Jan 1st is the first week of the year.
  },
});
