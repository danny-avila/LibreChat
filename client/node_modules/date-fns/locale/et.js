"use strict";
exports.et = void 0;
var _index = require("./et/_lib/formatDistance.js");
var _index2 = require("./et/_lib/formatLong.js");
var _index3 = require("./et/_lib/formatRelative.js");
var _index4 = require("./et/_lib/localize.js");
var _index5 = require("./et/_lib/match.js");

/**
 * @category Locales
 * @summary Estonian locale.
 * @language Estonian
 * @iso-639-2 est
 * @author Priit Hansen [@HansenPriit](https://github.com/priithansen)
 */
const et = (exports.et = {
  code: "et",
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
