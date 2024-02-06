"use strict";
exports.mk = void 0;
var _index = require("./mk/_lib/formatDistance.js");
var _index2 = require("./mk/_lib/formatLong.js");
var _index3 = require("./mk/_lib/formatRelative.js");
var _index4 = require("./mk/_lib/localize.js");
var _index5 = require("./mk/_lib/match.js");

/**
 * @category Locales
 * @summary Macedonian locale.
 * @language Macedonian
 * @iso-639-2 mkd
 * @author Petar Vlahu [@vlahupetar](https://github.com/vlahupetar)
 * @author Altrim Beqiri [@altrim](https://github.com/altrim)
 */
const mk = (exports.mk = {
  code: "mk",
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
