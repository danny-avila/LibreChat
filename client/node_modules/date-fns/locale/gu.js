"use strict";
exports.gu = void 0;
var _index = require("./gu/_lib/formatDistance.js");
var _index2 = require("./gu/_lib/formatLong.js");
var _index3 = require("./gu/_lib/formatRelative.js");
var _index4 = require("./gu/_lib/localize.js");
var _index5 = require("./gu/_lib/match.js");

/**
 * @category Locales
 * @summary Gujarati locale (India).
 * @language Gujarati
 * @iso-639-2 guj
 * @author Manaday Mavani [@ManadayM](https://github.com/manadaym)
 */
const gu = (exports.gu = {
  code: "gu",
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
