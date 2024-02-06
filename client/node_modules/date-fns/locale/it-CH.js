"use strict";
exports.itCH = void 0;
var _index = require("./it/_lib/formatDistance.js");
var _index2 = require("./it/_lib/formatRelative.js");
var _index3 = require("./it/_lib/localize.js");
var _index4 = require("./it/_lib/match.js");
var _index5 = require("./it-CH/_lib/formatLong.js");

/**
 * @category Locales
 * @summary Italian locale (Switzerland).
 * @language Italian
 * @iso-639-2 ita
 * @author Mike Peyer [@maic66](https://github.com/maic66)
 */
const itCH = (exports.itCH = {
  code: "it-CH",
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
