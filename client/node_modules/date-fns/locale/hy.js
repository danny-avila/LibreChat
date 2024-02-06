"use strict";
exports.hy = void 0;
var _index = require("./hy/_lib/formatDistance.js");
var _index2 = require("./hy/_lib/formatLong.js");
var _index3 = require("./hy/_lib/formatRelative.js");
var _index4 = require("./hy/_lib/localize.js");
var _index5 = require("./hy/_lib/match.js");

/**
 * @category Locales
 * @summary Armenian locale
 * @language Armenian
 * @iso-639-2 arm
 * @author Alex Igityan [@alexigityan](https://github.com/alexigityan)
 */
const hy = (exports.hy = {
  code: "hy",
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
