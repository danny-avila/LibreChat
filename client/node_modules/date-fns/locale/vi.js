"use strict";
exports.vi = void 0;
var _index = require("./vi/_lib/formatDistance.js");
var _index2 = require("./vi/_lib/formatLong.js");
var _index3 = require("./vi/_lib/formatRelative.js");
var _index4 = require("./vi/_lib/localize.js");
var _index5 = require("./vi/_lib/match.js");

/**
 * @category Locales
 * @summary Vietnamese locale (Vietnam).
 * @language Vietnamese
 * @iso-639-2 vie
 * @author Thanh Tran [@trongthanh](https://github.com/trongthanh)
 * @author Leroy Hopson [@lihop](https://github.com/lihop)
 */
const vi = (exports.vi = {
  code: "vi",
  formatDistance: _index.formatDistance,
  formatLong: _index2.formatLong,
  formatRelative: _index3.formatRelative,
  localize: _index4.localize,
  match: _index5.match,
  options: {
    weekStartsOn: 1 /* Monday */,
    firstWeekContainsDate: 1 /* First week of new year contains Jan 1st  */,
  },
});
