"use strict";
exports.lb = void 0;
var _index = require("./lb/_lib/formatDistance.js");
var _index2 = require("./lb/_lib/formatLong.js");
var _index3 = require("./lb/_lib/formatRelative.js");
var _index4 = require("./lb/_lib/localize.js");
var _index5 = require("./lb/_lib/match.js");

/**
 * @category Locales
 * @summary Luxembourgish locale.
 * @language Luxembourgish
 * @iso-639-2 ltz
 * @author Daniel Waxweiler [@dwaxweiler](https://github.com/dwaxweiler)
 */
const lb = (exports.lb = {
  code: "lb",
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
