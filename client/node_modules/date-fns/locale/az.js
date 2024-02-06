"use strict";
exports.az = void 0;
var _index = require("./az/_lib/formatDistance.js");
var _index2 = require("./az/_lib/formatLong.js");
var _index3 = require("./az/_lib/formatRelative.js");
var _index4 = require("./az/_lib/localize.js");
var _index5 = require("./az/_lib/match.js");

/**
 * @category Locales
 * @summary Azerbaijani locale.
 * @language Azerbaijani
 * @iso-639-2 aze
 */

const az = (exports.az = {
  code: "az",
  formatDistance: _index.formatDistance,
  formatLong: _index2.formatLong,
  formatRelative: _index3.formatRelative,
  localize: _index4.localize,
  match: _index5.match,
  options: {
    weekStartsOn: 1,
    firstWeekContainsDate: 1,
  },
});
