"use strict";
exports.km = void 0;
var _index = require("./km/_lib/formatDistance.js");
var _index2 = require("./km/_lib/formatLong.js");
var _index3 = require("./km/_lib/formatRelative.js");
var _index4 = require("./km/_lib/localize.js");
var _index5 = require("./km/_lib/match.js");

/**
 * @category Locales
 * @summary Khmer locale (Cambodian).
 * @language Khmer
 * @iso-639-2 khm
 * @author Seanghay Yath [@seanghay](https://github.com/seanghay)
 */
const km = (exports.km = {
  code: "km",
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
