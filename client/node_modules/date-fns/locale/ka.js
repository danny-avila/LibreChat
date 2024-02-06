"use strict";
exports.ka = void 0;
var _index = require("./ka/_lib/formatDistance.js");
var _index2 = require("./ka/_lib/formatLong.js");
var _index3 = require("./ka/_lib/formatRelative.js");
var _index4 = require("./ka/_lib/localize.js");
var _index5 = require("./ka/_lib/match.js");

/**
 * @category Locales
 * @summary Georgian locale.
 * @language Georgian
 * @iso-639-2 geo
 * @author Lado Lomidze [@Landish](https://github.com/Landish)
 * @author Nick Shvelidze [@shvelo](https://github.com/shvelo)
 */
const ka = (exports.ka = {
  code: "ka",
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
