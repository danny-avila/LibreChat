"use strict";
exports.faIR = void 0;
var _index = require("./fa-IR/_lib/formatDistance.js");
var _index2 = require("./fa-IR/_lib/formatLong.js");
var _index3 = require("./fa-IR/_lib/formatRelative.js");
var _index4 = require("./fa-IR/_lib/localize.js");
var _index5 = require("./fa-IR/_lib/match.js");

/**
 * @category Locales
 * @summary Persian/Farsi locale (Iran).
 * @language Persian
 * @iso-639-2 ira
 * @author Morteza Ziyae [@mort3za](https://github.com/mort3za)
 */
const faIR = (exports.faIR = {
  code: "fa-IR",
  formatDistance: _index.formatDistance,
  formatLong: _index2.formatLong,
  formatRelative: _index3.formatRelative,
  localize: _index4.localize,
  match: _index5.match,
  options: {
    weekStartsOn: 6 /* Saturday */,
    firstWeekContainsDate: 1,
  },
});
