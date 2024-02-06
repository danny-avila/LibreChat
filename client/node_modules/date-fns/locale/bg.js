"use strict";
exports.bg = void 0;
var _index = require("./bg/_lib/formatDistance.js");
var _index2 = require("./bg/_lib/formatLong.js");
var _index3 = require("./bg/_lib/formatRelative.js");
var _index4 = require("./bg/_lib/localize.js");
var _index5 = require("./bg/_lib/match.js");

/**
 * @category Locales
 * @summary Bulgarian locale.
 * @language Bulgarian
 * @iso-639-2 bul
 * @author Nikolay Stoynov [@arvigeus](https://github.com/arvigeus)
 * @author Tsvetan Ovedenski [@fintara](https://github.com/fintara)
 */
const bg = (exports.bg = {
  code: "bg",
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
