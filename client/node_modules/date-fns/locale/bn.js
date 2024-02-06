"use strict";
exports.bn = void 0;
var _index = require("./bn/_lib/formatDistance.js");
var _index2 = require("./bn/_lib/formatLong.js");
var _index3 = require("./bn/_lib/formatRelative.js");
var _index4 = require("./bn/_lib/localize.js");
var _index5 = require("./bn/_lib/match.js");

/**
 * @category Locales
 * @summary Bengali locale.
 * @language Bengali
 * @iso-639-2 ben
 * @author Touhidur Rahman [@touhidrahman](https://github.com/touhidrahman)
 * @author Farhad Yasir [@nutboltu](https://github.com/nutboltu)
 */
const bn = (exports.bn = {
  code: "bn",
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
