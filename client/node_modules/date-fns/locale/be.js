"use strict";
exports.be = void 0;
var _index = require("./be/_lib/formatDistance.js");
var _index2 = require("./be/_lib/formatLong.js");
var _index3 = require("./be/_lib/formatRelative.js");
var _index4 = require("./be/_lib/localize.js");
var _index5 = require("./be/_lib/match.js");

/**
 * @category Locales
 * @summary Belarusian locale.
 * @language Belarusian
 * @iso-639-2 bel
 * @author Kiryl Anokhin [@alyrik](https://github.com/alyrik)
 * @author Martin Wind [@arvigeus](https://github.com/mawi12345)
 */
const be = (exports.be = {
  code: "be",
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
