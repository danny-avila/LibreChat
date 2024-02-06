"use strict";
exports.gl = void 0;
var _index = require("./gl/_lib/formatDistance.js");
var _index2 = require("./gl/_lib/formatLong.js");
var _index3 = require("./gl/_lib/formatRelative.js");
var _index4 = require("./gl/_lib/localize.js");
var _index5 = require("./gl/_lib/match.js");

/**
 * @category Locales
 * @summary Galician locale.
 * @language Galician
 * @iso-639-2 glg
 * @author Alberto Doval - Cocodin Technology[@cocodinTech](https://github.com/cocodinTech)
 * @author Fidel Pita [@fidelpita](https://github.com/fidelpita)
 */
const gl = (exports.gl = {
  code: "gl",
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
