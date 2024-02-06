"use strict";
exports.ru = void 0;
var _index = require("./ru/_lib/formatDistance.js");
var _index2 = require("./ru/_lib/formatLong.js");
var _index3 = require("./ru/_lib/formatRelative.js");
var _index4 = require("./ru/_lib/localize.js");
var _index5 = require("./ru/_lib/match.js");

/**
 * @category Locales
 * @summary Russian locale.
 * @language Russian
 * @iso-639-2 rus
 * @author Sasha Koss [@kossnocorp](https://github.com/kossnocorp)
 * @author Lesha Koss [@leshakoss](https://github.com/leshakoss)
 */
const ru = (exports.ru = {
  code: "ru",
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
