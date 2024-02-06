"use strict";
exports.lv = void 0;
var _index = require("./lv/_lib/formatDistance.js");
var _index2 = require("./lv/_lib/formatLong.js");
var _index3 = require("./lv/_lib/formatRelative.js");
var _index4 = require("./lv/_lib/localize.js");
var _index5 = require("./lv/_lib/match.js");

/**
 * @category Locales
 * @summary Latvian locale (Latvia).
 * @language Latvian
 * @iso-639-2 lav
 * @author Rūdolfs Puķītis [@prudolfs](https://github.com/prudolfs)
 */
const lv = (exports.lv = {
  code: "lv",
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
