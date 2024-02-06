"use strict";
exports.enNZ = void 0;
var _index = require("./en-US/_lib/formatDistance.js");
var _index2 = require("./en-US/_lib/formatRelative.js");
var _index3 = require("./en-US/_lib/localize.js");
var _index4 = require("./en-US/_lib/match.js");

var _index5 = require("./en-NZ/_lib/formatLong.js");

/**
 * @category Locales
 * @summary English locale (New Zealand).
 * @language English
 * @iso-639-2 eng
 * @author Murray Lucas [@muntact](https://github.com/muntact)
 */
const enNZ = (exports.enNZ = {
  code: "en-NZ",
  formatDistance: _index.formatDistance,
  formatLong: _index5.formatLong,
  formatRelative: _index2.formatRelative,
  localize: _index3.localize,
  match: _index4.match,
  options: {
    weekStartsOn: 1 /* Monday */,
    firstWeekContainsDate: 4,
  },
});
