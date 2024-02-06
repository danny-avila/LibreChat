"use strict";
exports.cy = void 0;
var _index = require("./cy/_lib/formatDistance.js");
var _index2 = require("./cy/_lib/formatLong.js");
var _index3 = require("./cy/_lib/formatRelative.js");
var _index4 = require("./cy/_lib/localize.js");
var _index5 = require("./cy/_lib/match.js");

/**
 * @category Locales
 * @summary Welsh locale.
 * @language Welsh
 * @iso-639-2 cym
 * @author Elwyn Malethan [@elmomalmo](https://github.com/elmomalmo)
 */
const cy = (exports.cy = {
  code: "cy",
  formatDistance: _index.formatDistance,
  formatLong: _index2.formatLong,
  formatRelative: _index3.formatRelative,
  localize: _index4.localize,
  match: _index5.match,
  options: {
    weekStartsOn: 0 /* Sunday */,
    firstWeekContainsDate: 1,
  },
});
