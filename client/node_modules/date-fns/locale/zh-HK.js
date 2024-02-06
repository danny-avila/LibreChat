"use strict";
exports.zhHK = void 0;
var _index = require("./zh-HK/_lib/formatDistance.js");
var _index2 = require("./zh-HK/_lib/formatLong.js");
var _index3 = require("./zh-HK/_lib/formatRelative.js");
var _index4 = require("./zh-HK/_lib/localize.js");
var _index5 = require("./zh-HK/_lib/match.js");

/**
 * @category Locales
 * @summary Chinese Traditional locale.
 * @language Chinese Traditional
 * @iso-639-2 zho
 * @author Gary Ip [@gaplo](https://github.com/gaplo)
 */
const zhHK = (exports.zhHK = {
  code: "zh-HK",
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
