"use strict";
exports.pl = void 0;
var _index = require("./pl/_lib/formatDistance.js");
var _index2 = require("./pl/_lib/formatLong.js");
var _index3 = require("./pl/_lib/formatRelative.js");
var _index4 = require("./pl/_lib/localize.js");
var _index5 = require("./pl/_lib/match.js");

/**
 * @category Locales
 * @summary Polish locale.
 * @language Polish
 * @iso-639-2 pol
 * @author Mateusz Derks [@ertrzyiks](https://github.com/ertrzyiks)
 * @author Just RAG [@justrag](https://github.com/justrag)
 * @author Mikolaj Grzyb [@mikolajgrzyb](https://github.com/mikolajgrzyb)
 * @author Mateusz Tokarski [@mutisz](https://github.com/mutisz)
 */
const pl = (exports.pl = {
  code: "pl",
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
