"use strict";
exports.fi = void 0;
var _index = require("./fi/_lib/formatDistance.js");
var _index2 = require("./fi/_lib/formatLong.js");
var _index3 = require("./fi/_lib/formatRelative.js");
var _index4 = require("./fi/_lib/localize.js");
var _index5 = require("./fi/_lib/match.js");

/**
 * @category Locales
 * @summary Finnish locale.
 * @language Finnish
 * @iso-639-2 fin
 * @author Pyry-Samuli Lahti [@Pyppe](https://github.com/Pyppe)
 * @author Edo Rivai [@mikolajgrzyb](https://github.com/mikolajgrzyb)
 * @author Samu Juvonen [@sjuvonen](https://github.com/sjuvonen)
 */
const fi = (exports.fi = {
  code: "fi",
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
