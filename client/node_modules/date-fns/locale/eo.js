"use strict";
exports.eo = void 0;
var _index = require("./eo/_lib/formatDistance.js");
var _index2 = require("./eo/_lib/formatLong.js");
var _index3 = require("./eo/_lib/formatRelative.js");
var _index4 = require("./eo/_lib/localize.js");
var _index5 = require("./eo/_lib/match.js");

/**
 * @category Locales
 * @summary Esperanto locale.
 * @language Esperanto
 * @iso-639-2 epo
 * @author date-fns
 */
const eo = (exports.eo = {
  code: "eo",
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
