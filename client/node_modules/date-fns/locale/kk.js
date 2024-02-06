"use strict";
exports.kk = void 0;
var _index = require("./kk/_lib/formatDistance.js");
var _index2 = require("./kk/_lib/formatLong.js");
var _index3 = require("./kk/_lib/formatRelative.js");
var _index4 = require("./kk/_lib/localize.js");
var _index5 = require("./kk/_lib/match.js");

/**
 * @category Locales
 * @summary Kazakh locale.
 * @language Kazakh
 * @iso-639-2 kaz
 * @author Nikita Bayev [@drugoi](https://github.com/drugoi)
 */
const kk = (exports.kk = {
  code: "kk",
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
