"use strict";
exports.id = void 0;
var _index = require("./id/_lib/formatDistance.js");
var _index2 = require("./id/_lib/formatLong.js");
var _index3 = require("./id/_lib/formatRelative.js");
var _index4 = require("./id/_lib/localize.js");
var _index5 = require("./id/_lib/match.js");

/**
 * @category Locales
 * @summary Indonesian locale.
 * @language Indonesian
 * @iso-639-2 ind
 * @author Rahmat Budiharso [@rbudiharso](https://github.com/rbudiharso)
 * @author Benget Nata [@bentinata](https://github.com/bentinata)
 * @author Budi Irawan [@deerawan](https://github.com/deerawan)
 * @author Try Ajitiono [@imballinst](https://github.com/imballinst)
 */
const id = (exports.id = {
  code: "id",
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
