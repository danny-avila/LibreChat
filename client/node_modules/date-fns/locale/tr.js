"use strict";
exports.tr = void 0;
var _index = require("./tr/_lib/formatDistance.js");
var _index2 = require("./tr/_lib/formatLong.js");
var _index3 = require("./tr/_lib/formatRelative.js");
var _index4 = require("./tr/_lib/localize.js");
var _index5 = require("./tr/_lib/match.js");

/**
 * @category Locales
 * @summary Turkish locale.
 * @language Turkish
 * @iso-639-2 tur
 * @author Alpcan Aydın [@alpcanaydin](https://github.com/alpcanaydin)
 * @author Berkay Sargın [@berkaey](https://github.com/berkaey)
 * @author Fatih Bulut [@bulutfatih](https://github.com/bulutfatih)
 * @author Ismail Demirbilek [@dbtek](https://github.com/dbtek)
 * @author İsmail Kayar [@ikayar](https://github.com/ikayar)
 *
 *
 */
const tr = (exports.tr = {
  code: "tr",
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
