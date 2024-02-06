"use strict";
exports.he = void 0;
var _index = require("./he/_lib/formatDistance.js");
var _index2 = require("./he/_lib/formatLong.js");
var _index3 = require("./he/_lib/formatRelative.js");
var _index4 = require("./he/_lib/localize.js");
var _index5 = require("./he/_lib/match.js");

/**
 * @category Locales
 * @summary Hebrew locale.
 * @language Hebrew
 * @iso-639-2 heb
 * @author Nir Lahad [@nirlah](https://github.com/nirlah)
 */
const he = (exports.he = {
  code: "he",
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
