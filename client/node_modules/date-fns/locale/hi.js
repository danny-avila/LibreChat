"use strict";
exports.hi = void 0;
var _index = require("./hi/_lib/formatDistance.js");
var _index2 = require("./hi/_lib/formatLong.js");
var _index3 = require("./hi/_lib/formatRelative.js");
var _index4 = require("./hi/_lib/localize.js");
var _index5 = require("./hi/_lib/match.js");

/**
 * @category Locales
 * @summary Hindi locale (India).
 * @language Hindi
 * @iso-639-2 hin
 * @author Mukesh Mandiwal [@mukeshmandiwal](https://github.com/mukeshmandiwal)
 */
const hi = (exports.hi = {
  code: "hi",
  formatDistance: _index.formatDistance,
  formatLong: _index2.formatLong,
  formatRelative: _index3.formatRelative,
  localize: _index4.localize,
  match: _index5.match,
  options: {
    weekStartsOn: 0 /* Monday */,
    firstWeekContainsDate: 4,
  },
});
