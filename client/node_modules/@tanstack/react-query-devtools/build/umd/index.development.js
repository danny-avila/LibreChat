(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('react'), require('@tanstack/react-query')) :
  typeof define === 'function' && define.amd ? define(['exports', 'react', '@tanstack/react-query'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.ReactQueryDevtools = {}, global.React, global.ReactQuery));
})(this, (function (exports, React, reactQuery) { 'use strict';

  function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

  function _interopNamespace(e) {
    if (e && e.__esModule) return e;
    var n = Object.create(null);
    if (e) {
      Object.keys(e).forEach(function (k) {
        if (k !== 'default') {
          var d = Object.getOwnPropertyDescriptor(e, k);
          Object.defineProperty(n, k, d.get ? d : {
            enumerable: true,
            get: function () { return e[k]; }
          });
        }
      });
    }
    n["default"] = e;
    return Object.freeze(n);
  }

  var React__default = /*#__PURE__*/_interopDefaultLegacy(React);
  var React__namespace = /*#__PURE__*/_interopNamespace(React);

  function _extends() {
    _extends = Object.assign ? Object.assign.bind() : function (target) {
      for (var i = 1; i < arguments.length; i++) {
        var source = arguments[i];

        for (var key in source) {
          if (Object.prototype.hasOwnProperty.call(source, key)) {
            target[key] = source[key];
          }
        }
      }

      return target;
    };
    return _extends.apply(this, arguments);
  }

  /**
   * match-sorter-utils
   *
   * Copyright (c) TanStack
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE.md file in the root directory of this source tree.
   *
   * @license MIT
   */
  const characterMap = {
    À: 'A',
    Á: 'A',
    Â: 'A',
    Ã: 'A',
    Ä: 'A',
    Å: 'A',
    Ấ: 'A',
    Ắ: 'A',
    Ẳ: 'A',
    Ẵ: 'A',
    Ặ: 'A',
    Æ: 'AE',
    Ầ: 'A',
    Ằ: 'A',
    Ȃ: 'A',
    Ç: 'C',
    Ḉ: 'C',
    È: 'E',
    É: 'E',
    Ê: 'E',
    Ë: 'E',
    Ế: 'E',
    Ḗ: 'E',
    Ề: 'E',
    Ḕ: 'E',
    Ḝ: 'E',
    Ȇ: 'E',
    Ì: 'I',
    Í: 'I',
    Î: 'I',
    Ï: 'I',
    Ḯ: 'I',
    Ȋ: 'I',
    Ð: 'D',
    Ñ: 'N',
    Ò: 'O',
    Ó: 'O',
    Ô: 'O',
    Õ: 'O',
    Ö: 'O',
    Ø: 'O',
    Ố: 'O',
    Ṍ: 'O',
    Ṓ: 'O',
    Ȏ: 'O',
    Ù: 'U',
    Ú: 'U',
    Û: 'U',
    Ü: 'U',
    Ý: 'Y',
    à: 'a',
    á: 'a',
    â: 'a',
    ã: 'a',
    ä: 'a',
    å: 'a',
    ấ: 'a',
    ắ: 'a',
    ẳ: 'a',
    ẵ: 'a',
    ặ: 'a',
    æ: 'ae',
    ầ: 'a',
    ằ: 'a',
    ȃ: 'a',
    ç: 'c',
    ḉ: 'c',
    è: 'e',
    é: 'e',
    ê: 'e',
    ë: 'e',
    ế: 'e',
    ḗ: 'e',
    ề: 'e',
    ḕ: 'e',
    ḝ: 'e',
    ȇ: 'e',
    ì: 'i',
    í: 'i',
    î: 'i',
    ï: 'i',
    ḯ: 'i',
    ȋ: 'i',
    ð: 'd',
    ñ: 'n',
    ò: 'o',
    ó: 'o',
    ô: 'o',
    õ: 'o',
    ö: 'o',
    ø: 'o',
    ố: 'o',
    ṍ: 'o',
    ṓ: 'o',
    ȏ: 'o',
    ù: 'u',
    ú: 'u',
    û: 'u',
    ü: 'u',
    ý: 'y',
    ÿ: 'y',
    Ā: 'A',
    ā: 'a',
    Ă: 'A',
    ă: 'a',
    Ą: 'A',
    ą: 'a',
    Ć: 'C',
    ć: 'c',
    Ĉ: 'C',
    ĉ: 'c',
    Ċ: 'C',
    ċ: 'c',
    Č: 'C',
    č: 'c',
    C̆: 'C',
    c̆: 'c',
    Ď: 'D',
    ď: 'd',
    Đ: 'D',
    đ: 'd',
    Ē: 'E',
    ē: 'e',
    Ĕ: 'E',
    ĕ: 'e',
    Ė: 'E',
    ė: 'e',
    Ę: 'E',
    ę: 'e',
    Ě: 'E',
    ě: 'e',
    Ĝ: 'G',
    Ǵ: 'G',
    ĝ: 'g',
    ǵ: 'g',
    Ğ: 'G',
    ğ: 'g',
    Ġ: 'G',
    ġ: 'g',
    Ģ: 'G',
    ģ: 'g',
    Ĥ: 'H',
    ĥ: 'h',
    Ħ: 'H',
    ħ: 'h',
    Ḫ: 'H',
    ḫ: 'h',
    Ĩ: 'I',
    ĩ: 'i',
    Ī: 'I',
    ī: 'i',
    Ĭ: 'I',
    ĭ: 'i',
    Į: 'I',
    į: 'i',
    İ: 'I',
    ı: 'i',
    Ĳ: 'IJ',
    ĳ: 'ij',
    Ĵ: 'J',
    ĵ: 'j',
    Ķ: 'K',
    ķ: 'k',
    Ḱ: 'K',
    ḱ: 'k',
    K̆: 'K',
    k̆: 'k',
    Ĺ: 'L',
    ĺ: 'l',
    Ļ: 'L',
    ļ: 'l',
    Ľ: 'L',
    ľ: 'l',
    Ŀ: 'L',
    ŀ: 'l',
    Ł: 'l',
    ł: 'l',
    Ḿ: 'M',
    ḿ: 'm',
    M̆: 'M',
    m̆: 'm',
    Ń: 'N',
    ń: 'n',
    Ņ: 'N',
    ņ: 'n',
    Ň: 'N',
    ň: 'n',
    ŉ: 'n',
    N̆: 'N',
    n̆: 'n',
    Ō: 'O',
    ō: 'o',
    Ŏ: 'O',
    ŏ: 'o',
    Ő: 'O',
    ő: 'o',
    Œ: 'OE',
    œ: 'oe',
    P̆: 'P',
    p̆: 'p',
    Ŕ: 'R',
    ŕ: 'r',
    Ŗ: 'R',
    ŗ: 'r',
    Ř: 'R',
    ř: 'r',
    R̆: 'R',
    r̆: 'r',
    Ȓ: 'R',
    ȓ: 'r',
    Ś: 'S',
    ś: 's',
    Ŝ: 'S',
    ŝ: 's',
    Ş: 'S',
    Ș: 'S',
    ș: 's',
    ş: 's',
    Š: 'S',
    š: 's',
    Ţ: 'T',
    ţ: 't',
    ț: 't',
    Ț: 'T',
    Ť: 'T',
    ť: 't',
    Ŧ: 'T',
    ŧ: 't',
    T̆: 'T',
    t̆: 't',
    Ũ: 'U',
    ũ: 'u',
    Ū: 'U',
    ū: 'u',
    Ŭ: 'U',
    ŭ: 'u',
    Ů: 'U',
    ů: 'u',
    Ű: 'U',
    ű: 'u',
    Ų: 'U',
    ų: 'u',
    Ȗ: 'U',
    ȗ: 'u',
    V̆: 'V',
    v̆: 'v',
    Ŵ: 'W',
    ŵ: 'w',
    Ẃ: 'W',
    ẃ: 'w',
    X̆: 'X',
    x̆: 'x',
    Ŷ: 'Y',
    ŷ: 'y',
    Ÿ: 'Y',
    Y̆: 'Y',
    y̆: 'y',
    Ź: 'Z',
    ź: 'z',
    Ż: 'Z',
    ż: 'z',
    Ž: 'Z',
    ž: 'z',
    ſ: 's',
    ƒ: 'f',
    Ơ: 'O',
    ơ: 'o',
    Ư: 'U',
    ư: 'u',
    Ǎ: 'A',
    ǎ: 'a',
    Ǐ: 'I',
    ǐ: 'i',
    Ǒ: 'O',
    ǒ: 'o',
    Ǔ: 'U',
    ǔ: 'u',
    Ǖ: 'U',
    ǖ: 'u',
    Ǘ: 'U',
    ǘ: 'u',
    Ǚ: 'U',
    ǚ: 'u',
    Ǜ: 'U',
    ǜ: 'u',
    Ứ: 'U',
    ứ: 'u',
    Ṹ: 'U',
    ṹ: 'u',
    Ǻ: 'A',
    ǻ: 'a',
    Ǽ: 'AE',
    ǽ: 'ae',
    Ǿ: 'O',
    ǿ: 'o',
    Þ: 'TH',
    þ: 'th',
    Ṕ: 'P',
    ṕ: 'p',
    Ṥ: 'S',
    ṥ: 's',
    X́: 'X',
    x́: 'x',
    Ѓ: 'Г',
    ѓ: 'г',
    Ќ: 'К',
    ќ: 'к',
    A̋: 'A',
    a̋: 'a',
    E̋: 'E',
    e̋: 'e',
    I̋: 'I',
    i̋: 'i',
    Ǹ: 'N',
    ǹ: 'n',
    Ồ: 'O',
    ồ: 'o',
    Ṑ: 'O',
    ṑ: 'o',
    Ừ: 'U',
    ừ: 'u',
    Ẁ: 'W',
    ẁ: 'w',
    Ỳ: 'Y',
    ỳ: 'y',
    Ȁ: 'A',
    ȁ: 'a',
    Ȅ: 'E',
    ȅ: 'e',
    Ȉ: 'I',
    ȉ: 'i',
    Ȍ: 'O',
    ȍ: 'o',
    Ȑ: 'R',
    ȑ: 'r',
    Ȕ: 'U',
    ȕ: 'u',
    B̌: 'B',
    b̌: 'b',
    Č̣: 'C',
    č̣: 'c',
    Ê̌: 'E',
    ê̌: 'e',
    F̌: 'F',
    f̌: 'f',
    Ǧ: 'G',
    ǧ: 'g',
    Ȟ: 'H',
    ȟ: 'h',
    J̌: 'J',
    ǰ: 'j',
    Ǩ: 'K',
    ǩ: 'k',
    M̌: 'M',
    m̌: 'm',
    P̌: 'P',
    p̌: 'p',
    Q̌: 'Q',
    q̌: 'q',
    Ř̩: 'R',
    ř̩: 'r',
    Ṧ: 'S',
    ṧ: 's',
    V̌: 'V',
    v̌: 'v',
    W̌: 'W',
    w̌: 'w',
    X̌: 'X',
    x̌: 'x',
    Y̌: 'Y',
    y̌: 'y',
    A̧: 'A',
    a̧: 'a',
    B̧: 'B',
    b̧: 'b',
    Ḑ: 'D',
    ḑ: 'd',
    Ȩ: 'E',
    ȩ: 'e',
    Ɛ̧: 'E',
    ɛ̧: 'e',
    Ḩ: 'H',
    ḩ: 'h',
    I̧: 'I',
    i̧: 'i',
    Ɨ̧: 'I',
    ɨ̧: 'i',
    M̧: 'M',
    m̧: 'm',
    O̧: 'O',
    o̧: 'o',
    Q̧: 'Q',
    q̧: 'q',
    U̧: 'U',
    u̧: 'u',
    X̧: 'X',
    x̧: 'x',
    Z̧: 'Z',
    z̧: 'z'
  };
  const chars = Object.keys(characterMap).join('|');
  const allAccents = new RegExp(chars, 'g');
  function removeAccents(str) {
    return str.replace(allAccents, match => {
      return characterMap[match];
    });
  }

  /**
   * @name match-sorter
   * @license MIT license.
   * @copyright (c) 2099 Kent C. Dodds
   * @author Kent C. Dodds <me@kentcdodds.com> (https://kentcdodds.com)
   */
  const rankings = {
    CASE_SENSITIVE_EQUAL: 7,
    EQUAL: 6,
    STARTS_WITH: 5,
    WORD_STARTS_WITH: 4,
    CONTAINS: 3,
    ACRONYM: 2,
    MATCHES: 1,
    NO_MATCH: 0
  };
  /**
   * Gets the highest ranking for value for the given item based on its values for the given keys
   * @param {*} item - the item to rank
   * @param {Array} keys - the keys to get values from the item for the ranking
   * @param {String} value - the value to rank against
   * @param {Object} options - options to control the ranking
   * @return {{rank: Number, accessorIndex: Number, accessorThreshold: Number}} - the highest ranking
   */
  function rankItem(item, value, options) {
    var _options$threshold;
    options = options || {};
    options.threshold = (_options$threshold = options.threshold) != null ? _options$threshold : rankings.MATCHES;
    if (!options.accessors) {
      // if keys is not specified, then we assume the item given is ready to be matched
      const rank = getMatchRanking(item, value, options);
      return {
        // ends up being duplicate of 'item' in matches but consistent
        rankedValue: item,
        rank,
        accessorIndex: -1,
        accessorThreshold: options.threshold,
        passed: rank >= options.threshold
      };
    }
    const valuesToRank = getAllValuesToRank(item, options.accessors);
    const rankingInfo = {
      rankedValue: item,
      rank: rankings.NO_MATCH,
      accessorIndex: -1,
      accessorThreshold: options.threshold,
      passed: false
    };
    for (let i = 0; i < valuesToRank.length; i++) {
      const rankValue = valuesToRank[i];
      let newRank = getMatchRanking(rankValue.itemValue, value, options);
      const {
        minRanking,
        maxRanking,
        threshold = options.threshold
      } = rankValue.attributes;
      if (newRank < minRanking && newRank >= rankings.MATCHES) {
        newRank = minRanking;
      } else if (newRank > maxRanking) {
        newRank = maxRanking;
      }
      newRank = Math.min(newRank, maxRanking);
      if (newRank >= threshold && newRank > rankingInfo.rank) {
        rankingInfo.rank = newRank;
        rankingInfo.passed = true;
        rankingInfo.accessorIndex = i;
        rankingInfo.accessorThreshold = threshold;
        rankingInfo.rankedValue = rankValue.itemValue;
      }
    }
    return rankingInfo;
  }

  /**
   * Gives a rankings score based on how well the two strings match.
   * @param {String} testString - the string to test against
   * @param {String} stringToRank - the string to rank
   * @param {Object} options - options for the match (like keepDiacritics for comparison)
   * @returns {Number} the ranking for how well stringToRank matches testString
   */
  function getMatchRanking(testString, stringToRank, options) {
    testString = prepareValueForComparison(testString, options);
    stringToRank = prepareValueForComparison(stringToRank, options);

    // too long
    if (stringToRank.length > testString.length) {
      return rankings.NO_MATCH;
    }

    // case sensitive equals
    if (testString === stringToRank) {
      return rankings.CASE_SENSITIVE_EQUAL;
    }

    // Lower casing before further comparison
    testString = testString.toLowerCase();
    stringToRank = stringToRank.toLowerCase();

    // case insensitive equals
    if (testString === stringToRank) {
      return rankings.EQUAL;
    }

    // starts with
    if (testString.startsWith(stringToRank)) {
      return rankings.STARTS_WITH;
    }

    // word starts with
    if (testString.includes(` ${stringToRank}`)) {
      return rankings.WORD_STARTS_WITH;
    }

    // contains
    if (testString.includes(stringToRank)) {
      return rankings.CONTAINS;
    } else if (stringToRank.length === 1) {
      // If the only character in the given stringToRank
      //   isn't even contained in the testString, then
      //   it's definitely not a match.
      return rankings.NO_MATCH;
    }

    // acronym
    if (getAcronym(testString).includes(stringToRank)) {
      return rankings.ACRONYM;
    }

    // will return a number between rankings.MATCHES and
    // rankings.MATCHES + 1 depending  on how close of a match it is.
    return getClosenessRanking(testString, stringToRank);
  }

  /**
   * Generates an acronym for a string.
   *
   * @param {String} string the string for which to produce the acronym
   * @returns {String} the acronym
   */
  function getAcronym(string) {
    let acronym = '';
    const wordsInString = string.split(' ');
    wordsInString.forEach(wordInString => {
      const splitByHyphenWords = wordInString.split('-');
      splitByHyphenWords.forEach(splitByHyphenWord => {
        acronym += splitByHyphenWord.substr(0, 1);
      });
    });
    return acronym;
  }

  /**
   * Returns a score based on how spread apart the
   * characters from the stringToRank are within the testString.
   * A number close to rankings.MATCHES represents a loose match. A number close
   * to rankings.MATCHES + 1 represents a tighter match.
   * @param {String} testString - the string to test against
   * @param {String} stringToRank - the string to rank
   * @returns {Number} the number between rankings.MATCHES and
   * rankings.MATCHES + 1 for how well stringToRank matches testString
   */
  function getClosenessRanking(testString, stringToRank) {
    let matchingInOrderCharCount = 0;
    let charNumber = 0;
    function findMatchingCharacter(matchChar, string, index) {
      for (let j = index, J = string.length; j < J; j++) {
        const stringChar = string[j];
        if (stringChar === matchChar) {
          matchingInOrderCharCount += 1;
          return j + 1;
        }
      }
      return -1;
    }
    function getRanking(spread) {
      const spreadPercentage = 1 / spread;
      const inOrderPercentage = matchingInOrderCharCount / stringToRank.length;
      const ranking = rankings.MATCHES + inOrderPercentage * spreadPercentage;
      return ranking;
    }
    const firstIndex = findMatchingCharacter(stringToRank[0], testString, 0);
    if (firstIndex < 0) {
      return rankings.NO_MATCH;
    }
    charNumber = firstIndex;
    for (let i = 1, I = stringToRank.length; i < I; i++) {
      const matchChar = stringToRank[i];
      charNumber = findMatchingCharacter(matchChar, testString, charNumber);
      const found = charNumber > -1;
      if (!found) {
        return rankings.NO_MATCH;
      }
    }
    const spread = charNumber - firstIndex;
    return getRanking(spread);
  }

  /**
   * Prepares value for comparison by stringifying it, removing diacritics (if specified)
   * @param {String} value - the value to clean
   * @param {Object} options - {keepDiacritics: whether to remove diacritics}
   * @return {String} the prepared value
   */
  function prepareValueForComparison(value, _ref) {
    let {
      keepDiacritics
    } = _ref;
    // value might not actually be a string at this point (we don't get to choose)
    // so part of preparing the value for comparison is ensure that it is a string
    value = `${value}`; // toString
    if (!keepDiacritics) {
      value = removeAccents(value);
    }
    return value;
  }

  /**
   * Gets value for key in item at arbitrarily nested keypath
   * @param {Object} item - the item
   * @param {Object|Function} key - the potentially nested keypath or property callback
   * @return {Array} - an array containing the value(s) at the nested keypath
   */
  function getItemValues(item, accessor) {
    let accessorFn = accessor;
    if (typeof accessor === 'object') {
      accessorFn = accessor.accessor;
    }
    const value = accessorFn(item);

    // because `value` can also be undefined
    if (value == null) {
      return [];
    }
    if (Array.isArray(value)) {
      return value;
    }
    return [String(value)];
  }

  /**
   * Gets all the values for the given keys in the given item and returns an array of those values
   * @param item - the item from which the values will be retrieved
   * @param keys - the keys to use to retrieve the values
   * @return objects with {itemValue, attributes}
   */
  function getAllValuesToRank(item, accessors) {
    const allValues = [];
    for (let j = 0, J = accessors.length; j < J; j++) {
      const accessor = accessors[j];
      const attributes = getAccessorAttributes(accessor);
      const itemValues = getItemValues(item, accessor);
      for (let i = 0, I = itemValues.length; i < I; i++) {
        allValues.push({
          itemValue: itemValues[i],
          attributes
        });
      }
    }
    return allValues;
  }
  const defaultKeyAttributes = {
    maxRanking: Infinity,
    minRanking: -Infinity
  };
  /**
   * Gets all the attributes for the given accessor
   * @param accessor - the accessor from which the attributes will be retrieved
   * @return object containing the accessor's attributes
   */
  function getAccessorAttributes(accessor) {
    if (typeof accessor === 'function') {
      return defaultKeyAttributes;
    }
    return {
      ...defaultKeyAttributes,
      ...accessor
    };
  }

  var shim = {exports: {}};

  var useSyncExternalStoreShim_development = {};

  /**
   * @license React
   * use-sync-external-store-shim.development.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   */

  var hasRequiredUseSyncExternalStoreShim_development;

  function requireUseSyncExternalStoreShim_development () {
  	if (hasRequiredUseSyncExternalStoreShim_development) return useSyncExternalStoreShim_development;
  	hasRequiredUseSyncExternalStoreShim_development = 1;

  	{
  	  (function() {

  	/* global __REACT_DEVTOOLS_GLOBAL_HOOK__ */
  	if (
  	  typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ !== 'undefined' &&
  	  typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart ===
  	    'function'
  	) {
  	  __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(new Error());
  	}
  	          var React = React__default["default"];

  	var ReactSharedInternals = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

  	function error(format) {
  	  {
  	    {
  	      for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
  	        args[_key2 - 1] = arguments[_key2];
  	      }

  	      printWarning('error', format, args);
  	    }
  	  }
  	}

  	function printWarning(level, format, args) {
  	  // When changing this logic, you might want to also
  	  // update consoleWithStackDev.www.js as well.
  	  {
  	    var ReactDebugCurrentFrame = ReactSharedInternals.ReactDebugCurrentFrame;
  	    var stack = ReactDebugCurrentFrame.getStackAddendum();

  	    if (stack !== '') {
  	      format += '%s';
  	      args = args.concat([stack]);
  	    } // eslint-disable-next-line react-internal/safe-string-coercion


  	    var argsWithFormat = args.map(function (item) {
  	      return String(item);
  	    }); // Careful: RN currently depends on this prefix

  	    argsWithFormat.unshift('Warning: ' + format); // We intentionally don't use spread (or .apply) directly because it
  	    // breaks IE9: https://github.com/facebook/react/issues/13610
  	    // eslint-disable-next-line react-internal/no-production-logging

  	    Function.prototype.apply.call(console[level], console, argsWithFormat);
  	  }
  	}

  	/**
  	 * inlined Object.is polyfill to avoid requiring consumers ship their own
  	 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is
  	 */
  	function is(x, y) {
  	  return x === y && (x !== 0 || 1 / x === 1 / y) || x !== x && y !== y // eslint-disable-line no-self-compare
  	  ;
  	}

  	var objectIs = typeof Object.is === 'function' ? Object.is : is;

  	// dispatch for CommonJS interop named imports.

  	var useState = React.useState,
  	    useEffect = React.useEffect,
  	    useLayoutEffect = React.useLayoutEffect,
  	    useDebugValue = React.useDebugValue;
  	var didWarnOld18Alpha = false;
  	var didWarnUncachedGetSnapshot = false; // Disclaimer: This shim breaks many of the rules of React, and only works
  	// because of a very particular set of implementation details and assumptions
  	// -- change any one of them and it will break. The most important assumption
  	// is that updates are always synchronous, because concurrent rendering is
  	// only available in versions of React that also have a built-in
  	// useSyncExternalStore API. And we only use this shim when the built-in API
  	// does not exist.
  	//
  	// Do not assume that the clever hacks used by this hook also work in general.
  	// The point of this shim is to replace the need for hacks by other libraries.

  	function useSyncExternalStore(subscribe, getSnapshot, // Note: The shim does not use getServerSnapshot, because pre-18 versions of
  	// React do not expose a way to check if we're hydrating. So users of the shim
  	// will need to track that themselves and return the correct value
  	// from `getSnapshot`.
  	getServerSnapshot) {
  	  {
  	    if (!didWarnOld18Alpha) {
  	      if (React.startTransition !== undefined) {
  	        didWarnOld18Alpha = true;

  	        error('You are using an outdated, pre-release alpha of React 18 that ' + 'does not support useSyncExternalStore. The ' + 'use-sync-external-store shim will not work correctly. Upgrade ' + 'to a newer pre-release.');
  	      }
  	    }
  	  } // Read the current snapshot from the store on every render. Again, this
  	  // breaks the rules of React, and only works here because of specific
  	  // implementation details, most importantly that updates are
  	  // always synchronous.


  	  var value = getSnapshot();

  	  {
  	    if (!didWarnUncachedGetSnapshot) {
  	      var cachedValue = getSnapshot();

  	      if (!objectIs(value, cachedValue)) {
  	        error('The result of getSnapshot should be cached to avoid an infinite loop');

  	        didWarnUncachedGetSnapshot = true;
  	      }
  	    }
  	  } // Because updates are synchronous, we don't queue them. Instead we force a
  	  // re-render whenever the subscribed state changes by updating an some
  	  // arbitrary useState hook. Then, during render, we call getSnapshot to read
  	  // the current value.
  	  //
  	  // Because we don't actually use the state returned by the useState hook, we
  	  // can save a bit of memory by storing other stuff in that slot.
  	  //
  	  // To implement the early bailout, we need to track some things on a mutable
  	  // object. Usually, we would put that in a useRef hook, but we can stash it in
  	  // our useState hook instead.
  	  //
  	  // To force a re-render, we call forceUpdate({inst}). That works because the
  	  // new object always fails an equality check.


  	  var _useState = useState({
  	    inst: {
  	      value: value,
  	      getSnapshot: getSnapshot
  	    }
  	  }),
  	      inst = _useState[0].inst,
  	      forceUpdate = _useState[1]; // Track the latest getSnapshot function with a ref. This needs to be updated
  	  // in the layout phase so we can access it during the tearing check that
  	  // happens on subscribe.


  	  useLayoutEffect(function () {
  	    inst.value = value;
  	    inst.getSnapshot = getSnapshot; // Whenever getSnapshot or subscribe changes, we need to check in the
  	    // commit phase if there was an interleaved mutation. In concurrent mode
  	    // this can happen all the time, but even in synchronous mode, an earlier
  	    // effect may have mutated the store.

  	    if (checkIfSnapshotChanged(inst)) {
  	      // Force a re-render.
  	      forceUpdate({
  	        inst: inst
  	      });
  	    }
  	  }, [subscribe, value, getSnapshot]);
  	  useEffect(function () {
  	    // Check for changes right before subscribing. Subsequent changes will be
  	    // detected in the subscription handler.
  	    if (checkIfSnapshotChanged(inst)) {
  	      // Force a re-render.
  	      forceUpdate({
  	        inst: inst
  	      });
  	    }

  	    var handleStoreChange = function () {
  	      // TODO: Because there is no cross-renderer API for batching updates, it's
  	      // up to the consumer of this library to wrap their subscription event
  	      // with unstable_batchedUpdates. Should we try to detect when this isn't
  	      // the case and print a warning in development?
  	      // The store changed. Check if the snapshot changed since the last time we
  	      // read from the store.
  	      if (checkIfSnapshotChanged(inst)) {
  	        // Force a re-render.
  	        forceUpdate({
  	          inst: inst
  	        });
  	      }
  	    }; // Subscribe to the store and return a clean-up function.


  	    return subscribe(handleStoreChange);
  	  }, [subscribe]);
  	  useDebugValue(value);
  	  return value;
  	}

  	function checkIfSnapshotChanged(inst) {
  	  var latestGetSnapshot = inst.getSnapshot;
  	  var prevValue = inst.value;

  	  try {
  	    var nextValue = latestGetSnapshot();
  	    return !objectIs(prevValue, nextValue);
  	  } catch (error) {
  	    return true;
  	  }
  	}

  	function useSyncExternalStore$1(subscribe, getSnapshot, getServerSnapshot) {
  	  // Note: The shim does not use getServerSnapshot, because pre-18 versions of
  	  // React do not expose a way to check if we're hydrating. So users of the shim
  	  // will need to track that themselves and return the correct value
  	  // from `getSnapshot`.
  	  return getSnapshot();
  	}

  	var canUseDOM = !!(typeof window !== 'undefined' && typeof window.document !== 'undefined' && typeof window.document.createElement !== 'undefined');

  	var isServerEnvironment = !canUseDOM;

  	var shim = isServerEnvironment ? useSyncExternalStore$1 : useSyncExternalStore;
  	var useSyncExternalStore$2 = React.useSyncExternalStore !== undefined ? React.useSyncExternalStore : shim;

  	useSyncExternalStoreShim_development.useSyncExternalStore = useSyncExternalStore$2;
  	          /* global __REACT_DEVTOOLS_GLOBAL_HOOK__ */
  	if (
  	  typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ !== 'undefined' &&
  	  typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop ===
  	    'function'
  	) {
  	  __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(new Error());
  	}
  	        
  	  })();
  	}
  	return useSyncExternalStoreShim_development;
  }

  (function (module) {

  	{
  	  module.exports = requireUseSyncExternalStoreShim_development();
  	}
  } (shim));

  const getItem = key => {
    try {
      const itemValue = localStorage.getItem(key);

      if (typeof itemValue === 'string') {
        return JSON.parse(itemValue);
      }

      return undefined;
    } catch {
      return undefined;
    }
  };

  function useLocalStorage(key, defaultValue) {
    const [value, setValue] = React__namespace.useState();
    React__namespace.useEffect(() => {
      const initialValue = getItem(key);

      if (typeof initialValue === 'undefined' || initialValue === null) {
        setValue(typeof defaultValue === 'function' ? defaultValue() : defaultValue);
      } else {
        setValue(initialValue);
      }
    }, [defaultValue, key]);
    const setter = React__namespace.useCallback(updater => {
      setValue(old => {
        let newVal = updater;

        if (typeof updater == 'function') {
          newVal = updater(old);
        }

        try {
          localStorage.setItem(key, JSON.stringify(newVal));
        } catch {}

        return newVal;
      });
    }, [key]);
    return [value, setter];
  }

  var DoubleIndexedKV = /** @class */ (function () {
      function DoubleIndexedKV() {
          this.keyToValue = new Map();
          this.valueToKey = new Map();
      }
      DoubleIndexedKV.prototype.set = function (key, value) {
          this.keyToValue.set(key, value);
          this.valueToKey.set(value, key);
      };
      DoubleIndexedKV.prototype.getByKey = function (key) {
          return this.keyToValue.get(key);
      };
      DoubleIndexedKV.prototype.getByValue = function (value) {
          return this.valueToKey.get(value);
      };
      DoubleIndexedKV.prototype.clear = function () {
          this.keyToValue.clear();
          this.valueToKey.clear();
      };
      return DoubleIndexedKV;
  }());

  var Registry = /** @class */ (function () {
      function Registry(generateIdentifier) {
          this.generateIdentifier = generateIdentifier;
          this.kv = new DoubleIndexedKV();
      }
      Registry.prototype.register = function (value, identifier) {
          if (this.kv.getByValue(value)) {
              return;
          }
          if (!identifier) {
              identifier = this.generateIdentifier(value);
          }
          {
              var alreadyRegistered = this.kv.getByKey(identifier);
              if (alreadyRegistered && alreadyRegistered !== value) {
                  console.debug("Ambiguous class \"" + identifier + "\", provide a unique identifier.");
              }
          }
          this.kv.set(identifier, value);
      };
      Registry.prototype.clear = function () {
          this.kv.clear();
      };
      Registry.prototype.getIdentifier = function (value) {
          return this.kv.getByValue(value);
      };
      Registry.prototype.getValue = function (identifier) {
          return this.kv.getByKey(identifier);
      };
      return Registry;
  }());

  var __extends = (undefined && undefined.__extends) || (function () {
      var extendStatics = function (d, b) {
          extendStatics = Object.setPrototypeOf ||
              ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
              function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
          return extendStatics(d, b);
      };
      return function (d, b) {
          if (typeof b !== "function" && b !== null)
              throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
          extendStatics(d, b);
          function __() { this.constructor = d; }
          d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
      };
  })();
  var _ClassRegistry = /** @class */ (function (_super) {
      __extends(_ClassRegistry, _super);
      function _ClassRegistry() {
          var _this = _super.call(this, function (c) { return c.name; }) || this;
          _this.classToAllowedProps = new Map();
          return _this;
      }
      _ClassRegistry.prototype.register = function (value, options) {
          if (typeof options === 'object') {
              if (options.allowProps) {
                  this.classToAllowedProps.set(value, options.allowProps);
              }
              _super.prototype.register.call(this, value, options.identifier);
          }
          else {
              _super.prototype.register.call(this, value, options);
          }
      };
      _ClassRegistry.prototype.getAllowedProps = function (value) {
          return this.classToAllowedProps.get(value);
      };
      return _ClassRegistry;
  }(Registry));
  var ClassRegistry = new _ClassRegistry();

  var SymbolRegistry = new Registry(function (s) { var _a; return (_a = s.description) !== null && _a !== void 0 ? _a : ''; });

  var __read$3 = (undefined && undefined.__read) || function (o, n) {
      var m = typeof Symbol === "function" && o[Symbol.iterator];
      if (!m) return o;
      var i = m.call(o), r, ar = [], e;
      try {
          while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
      }
      catch (error) { e = { error: error }; }
      finally {
          try {
              if (r && !r.done && (m = i["return"])) m.call(i);
          }
          finally { if (e) throw e.error; }
      }
      return ar;
  };
  function valuesOfObj(record) {
      if ('values' in Object) {
          // eslint-disable-next-line es5/no-es6-methods
          return Object.values(record);
      }
      var values = [];
      // eslint-disable-next-line no-restricted-syntax
      for (var key in record) {
          if (record.hasOwnProperty(key)) {
              values.push(record[key]);
          }
      }
      return values;
  }
  function find(record, predicate) {
      var values = valuesOfObj(record);
      if ('find' in values) {
          // eslint-disable-next-line es5/no-es6-methods
          return values.find(predicate);
      }
      var valuesNotNever = values;
      for (var i = 0; i < valuesNotNever.length; i++) {
          var value = valuesNotNever[i];
          if (predicate(value)) {
              return value;
          }
      }
      return undefined;
  }
  function forEach(record, run) {
      Object.entries(record).forEach(function (_a) {
          var _b = __read$3(_a, 2), key = _b[0], value = _b[1];
          return run(value, key);
      });
  }
  function includes(arr, value) {
      return arr.indexOf(value) !== -1;
  }
  function findArr(record, predicate) {
      for (var i = 0; i < record.length; i++) {
          var value = record[i];
          if (predicate(value)) {
              return value;
          }
      }
      return undefined;
  }

  var transfomers = {};
  var CustomTransformerRegistry = {
      register: function (transformer) {
          transfomers[transformer.name] = transformer;
      },
      findApplicable: function (v) {
          return find(transfomers, function (transformer) { return transformer.isApplicable(v); });
      },
      findByName: function (name) {
          return transfomers[name];
      }
  };

  var __read$2 = (undefined && undefined.__read) || function (o, n) {
      var m = typeof Symbol === "function" && o[Symbol.iterator];
      if (!m) return o;
      var i = m.call(o), r, ar = [], e;
      try {
          while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
      }
      catch (error) { e = { error: error }; }
      finally {
          try {
              if (r && !r.done && (m = i["return"])) m.call(i);
          }
          finally { if (e) throw e.error; }
      }
      return ar;
  };
  var __spreadArray$2 = (undefined && undefined.__spreadArray) || function (to, from) {
      for (var i = 0, il = from.length, j = to.length; i < il; i++, j++)
          to[j] = from[i];
      return to;
  };
  var allowedErrorProps = [];
  var allowErrorProps = function () {
      var props = [];
      for (var _i = 0; _i < arguments.length; _i++) {
          props[_i] = arguments[_i];
      }
      allowedErrorProps.push.apply(allowedErrorProps, __spreadArray$2([], __read$2(props)));
  };

  var getType$1 = function (payload) {
      return Object.prototype.toString.call(payload).slice(8, -1);
  };
  var isUndefined = function (payload) {
      return typeof payload === 'undefined';
  };
  var isNull = function (payload) { return payload === null; };
  var isPlainObject$1 = function (payload) {
      if (getType$1(payload) !== 'Object')
          return false;
      if (Object.getPrototypeOf(payload) === null)
          return true;
      if (payload === Object.prototype)
          return false;
      return (payload.constructor === Object &&
          Object.getPrototypeOf(payload) === Object.prototype);
  };
  var isEmptyObject = function (payload) {
      return isPlainObject$1(payload) && Object.keys(payload).length === 0;
  };
  var isArray$1 = function (payload) {
      return Array.isArray(payload);
  };
  var isString = function (payload) {
      return typeof payload === 'string';
  };
  var isNumber = function (payload) {
      return typeof payload === 'number' && !isNaN(payload);
  };
  var isBoolean = function (payload) {
      return typeof payload === 'boolean';
  };
  var isRegExp = function (payload) {
      return payload instanceof RegExp;
  };
  var isMap = function (payload) {
      return payload instanceof Map;
  };
  var isSet = function (payload) {
      return payload instanceof Set;
  };
  var isSymbol = function (payload) {
      return getType$1(payload) === 'Symbol';
  };
  var isDate = function (payload) {
      return payload instanceof Date && !isNaN(payload.valueOf());
  };
  var isError = function (payload) {
      return payload instanceof Error;
  };
  var isNaNValue = function (payload) {
      return typeof payload === 'number' && isNaN(payload);
  };
  var isPrimitive = function (payload) {
      return isBoolean(payload) ||
          isNull(payload) ||
          isUndefined(payload) ||
          isNumber(payload) ||
          isString(payload) ||
          isSymbol(payload);
  };
  var isBigint = function (payload) {
      return typeof payload === 'bigint';
  };
  var isInfinite = function (payload) {
      return payload === Infinity || payload === -Infinity;
  };
  var isTypedArray = function (payload) {
      return ArrayBuffer.isView(payload) && !(payload instanceof DataView);
  };
  var isURL = function (payload) { return payload instanceof URL; };

  var escapeKey = function (key) { return key.replace(/\./g, '\\.'); };
  var stringifyPath = function (path) {
      return path
          .map(String)
          .map(escapeKey)
          .join('.');
  };
  var parsePath = function (string) {
      var result = [];
      var segment = '';
      for (var i = 0; i < string.length; i++) {
          var char = string.charAt(i);
          var isEscapedDot = char === '\\' && string.charAt(i + 1) === '.';
          if (isEscapedDot) {
              segment += '.';
              i++;
              continue;
          }
          var isEndOfSegment = char === '.';
          if (isEndOfSegment) {
              result.push(segment);
              segment = '';
              continue;
          }
          segment += char;
      }
      var lastSegment = segment;
      result.push(lastSegment);
      return result;
  };

  var __assign$1 = (undefined && undefined.__assign) || function () {
      __assign$1 = Object.assign || function(t) {
          for (var s, i = 1, n = arguments.length; i < n; i++) {
              s = arguments[i];
              for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                  t[p] = s[p];
          }
          return t;
      };
      return __assign$1.apply(this, arguments);
  };
  var __read$1 = (undefined && undefined.__read) || function (o, n) {
      var m = typeof Symbol === "function" && o[Symbol.iterator];
      if (!m) return o;
      var i = m.call(o), r, ar = [], e;
      try {
          while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
      }
      catch (error) { e = { error: error }; }
      finally {
          try {
              if (r && !r.done && (m = i["return"])) m.call(i);
          }
          finally { if (e) throw e.error; }
      }
      return ar;
  };
  var __spreadArray$1 = (undefined && undefined.__spreadArray) || function (to, from) {
      for (var i = 0, il = from.length, j = to.length; i < il; i++, j++)
          to[j] = from[i];
      return to;
  };
  function simpleTransformation(isApplicable, annotation, transform, untransform) {
      return {
          isApplicable: isApplicable,
          annotation: annotation,
          transform: transform,
          untransform: untransform
      };
  }
  var simpleRules = [
      simpleTransformation(isUndefined, 'undefined', function () { return null; }, function () { return undefined; }),
      simpleTransformation(isBigint, 'bigint', function (v) { return v.toString(); }, function (v) {
          if (typeof BigInt !== 'undefined') {
              return BigInt(v);
          }
          console.error('Please add a BigInt polyfill.');
          return v;
      }),
      simpleTransformation(isDate, 'Date', function (v) { return v.toISOString(); }, function (v) { return new Date(v); }),
      simpleTransformation(isError, 'Error', function (v) {
          var baseError = {
              name: v.name,
              message: v.message
          };
          allowedErrorProps.forEach(function (prop) {
              baseError[prop] = v[prop];
          });
          return baseError;
      }, function (v) {
          var e = new Error(v.message);
          e.name = v.name;
          e.stack = v.stack;
          allowedErrorProps.forEach(function (prop) {
              e[prop] = v[prop];
          });
          return e;
      }),
      simpleTransformation(isRegExp, 'regexp', function (v) { return '' + v; }, function (regex) {
          var body = regex.slice(1, regex.lastIndexOf('/'));
          var flags = regex.slice(regex.lastIndexOf('/') + 1);
          return new RegExp(body, flags);
      }),
      simpleTransformation(isSet, 'set', 
      // (sets only exist in es6+)
      // eslint-disable-next-line es5/no-es6-methods
      function (v) { return __spreadArray$1([], __read$1(v.values())); }, function (v) { return new Set(v); }),
      simpleTransformation(isMap, 'map', function (v) { return __spreadArray$1([], __read$1(v.entries())); }, function (v) { return new Map(v); }),
      simpleTransformation(function (v) { return isNaNValue(v) || isInfinite(v); }, 'number', function (v) {
          if (isNaNValue(v)) {
              return 'NaN';
          }
          if (v > 0) {
              return 'Infinity';
          }
          else {
              return '-Infinity';
          }
      }, Number),
      simpleTransformation(function (v) { return v === 0 && 1 / v === -Infinity; }, 'number', function () {
          return '-0';
      }, Number),
      simpleTransformation(isURL, 'URL', function (v) { return v.toString(); }, function (v) { return new URL(v); }),
  ];
  function compositeTransformation(isApplicable, annotation, transform, untransform) {
      return {
          isApplicable: isApplicable,
          annotation: annotation,
          transform: transform,
          untransform: untransform
      };
  }
  var symbolRule = compositeTransformation(function (s) {
      if (isSymbol(s)) {
          var isRegistered = !!SymbolRegistry.getIdentifier(s);
          return isRegistered;
      }
      return false;
  }, function (s) {
      var identifier = SymbolRegistry.getIdentifier(s);
      return ['symbol', identifier];
  }, function (v) { return v.description; }, function (_, a) {
      var value = SymbolRegistry.getValue(a[1]);
      if (!value) {
          throw new Error('Trying to deserialize unknown symbol');
      }
      return value;
  });
  var constructorToName = [
      Int8Array,
      Uint8Array,
      Int16Array,
      Uint16Array,
      Int32Array,
      Uint32Array,
      Float32Array,
      Float64Array,
      Uint8ClampedArray,
  ].reduce(function (obj, ctor) {
      obj[ctor.name] = ctor;
      return obj;
  }, {});
  var typedArrayRule = compositeTransformation(isTypedArray, function (v) { return ['typed-array', v.constructor.name]; }, function (v) { return __spreadArray$1([], __read$1(v)); }, function (v, a) {
      var ctor = constructorToName[a[1]];
      if (!ctor) {
          throw new Error('Trying to deserialize unknown typed array');
      }
      return new ctor(v);
  });
  function isInstanceOfRegisteredClass(potentialClass) {
      if (potentialClass === null || potentialClass === void 0 ? void 0 : potentialClass.constructor) {
          var isRegistered = !!ClassRegistry.getIdentifier(potentialClass.constructor);
          return isRegistered;
      }
      return false;
  }
  var classRule = compositeTransformation(isInstanceOfRegisteredClass, function (clazz) {
      var identifier = ClassRegistry.getIdentifier(clazz.constructor);
      return ['class', identifier];
  }, function (clazz) {
      var allowedProps = ClassRegistry.getAllowedProps(clazz.constructor);
      if (!allowedProps) {
          return __assign$1({}, clazz);
      }
      var result = {};
      allowedProps.forEach(function (prop) {
          result[prop] = clazz[prop];
      });
      return result;
  }, function (v, a) {
      var clazz = ClassRegistry.getValue(a[1]);
      if (!clazz) {
          throw new Error('Trying to deserialize unknown class - check https://github.com/blitz-js/superjson/issues/116#issuecomment-773996564');
      }
      return Object.assign(Object.create(clazz.prototype), v);
  });
  var customRule = compositeTransformation(function (value) {
      return !!CustomTransformerRegistry.findApplicable(value);
  }, function (value) {
      var transformer = CustomTransformerRegistry.findApplicable(value);
      return ['custom', transformer.name];
  }, function (value) {
      var transformer = CustomTransformerRegistry.findApplicable(value);
      return transformer.serialize(value);
  }, function (v, a) {
      var transformer = CustomTransformerRegistry.findByName(a[1]);
      if (!transformer) {
          throw new Error('Trying to deserialize unknown custom value');
      }
      return transformer.deserialize(v);
  });
  var compositeRules = [classRule, symbolRule, customRule, typedArrayRule];
  var transformValue = function (value) {
      var applicableCompositeRule = findArr(compositeRules, function (rule) {
          return rule.isApplicable(value);
      });
      if (applicableCompositeRule) {
          return {
              value: applicableCompositeRule.transform(value),
              type: applicableCompositeRule.annotation(value)
          };
      }
      var applicableSimpleRule = findArr(simpleRules, function (rule) {
          return rule.isApplicable(value);
      });
      if (applicableSimpleRule) {
          return {
              value: applicableSimpleRule.transform(value),
              type: applicableSimpleRule.annotation
          };
      }
      return undefined;
  };
  var simpleRulesByAnnotation = {};
  simpleRules.forEach(function (rule) {
      simpleRulesByAnnotation[rule.annotation] = rule;
  });
  var untransformValue = function (json, type) {
      if (isArray$1(type)) {
          switch (type[0]) {
              case 'symbol':
                  return symbolRule.untransform(json, type);
              case 'class':
                  return classRule.untransform(json, type);
              case 'custom':
                  return customRule.untransform(json, type);
              case 'typed-array':
                  return typedArrayRule.untransform(json, type);
              default:
                  throw new Error('Unknown transformation: ' + type);
          }
      }
      else {
          var transformation = simpleRulesByAnnotation[type];
          if (!transformation) {
              throw new Error('Unknown transformation: ' + type);
          }
          return transformation.untransform(json);
      }
  };

  var getNthKey = function (value, n) {
      var keys = value.keys();
      while (n > 0) {
          keys.next();
          n--;
      }
      return keys.next().value;
  };
  function validatePath(path) {
      if (includes(path, '__proto__')) {
          throw new Error('__proto__ is not allowed as a property');
      }
      if (includes(path, 'prototype')) {
          throw new Error('prototype is not allowed as a property');
      }
      if (includes(path, 'constructor')) {
          throw new Error('constructor is not allowed as a property');
      }
  }
  var getDeep = function (object, path) {
      validatePath(path);
      path.forEach(function (key) {
          object = object[key];
      });
      return object;
  };
  var setDeep = function (object, path, mapper) {
      validatePath(path);
      if (path.length === 0) {
          return mapper(object);
      }
      var parent = object;
      for (var i = 0; i < path.length - 1; i++) {
          var key = path[i];
          if (isArray$1(parent)) {
              var index = +key;
              parent = parent[index];
          }
          else if (isPlainObject$1(parent)) {
              parent = parent[key];
          }
          else if (isSet(parent)) {
              var row = +key;
              parent = getNthKey(parent, row);
          }
          else if (isMap(parent)) {
              var isEnd = i === path.length - 2;
              if (isEnd) {
                  break;
              }
              var row = +key;
              var type = +path[++i] === 0 ? 'key' : 'value';
              var keyOfRow = getNthKey(parent, row);
              switch (type) {
                  case 'key':
                      parent = keyOfRow;
                      break;
                  case 'value':
                      parent = parent.get(keyOfRow);
                      break;
              }
          }
      }
      var lastKey = path[path.length - 1];
      if (isArray$1(parent) || isPlainObject$1(parent)) {
          parent[lastKey] = mapper(parent[lastKey]);
      }
      if (isSet(parent)) {
          var oldValue = getNthKey(parent, +lastKey);
          var newValue = mapper(oldValue);
          if (oldValue !== newValue) {
              parent["delete"](oldValue);
              parent.add(newValue);
          }
      }
      if (isMap(parent)) {
          var row = +path[path.length - 2];
          var keyToRow = getNthKey(parent, row);
          var type = +lastKey === 0 ? 'key' : 'value';
          switch (type) {
              case 'key': {
                  var newKey = mapper(keyToRow);
                  parent.set(newKey, parent.get(keyToRow));
                  if (newKey !== keyToRow) {
                      parent["delete"](keyToRow);
                  }
                  break;
              }
              case 'value': {
                  parent.set(keyToRow, mapper(parent.get(keyToRow)));
                  break;
              }
          }
      }
      return object;
  };

  var __read = (undefined && undefined.__read) || function (o, n) {
      var m = typeof Symbol === "function" && o[Symbol.iterator];
      if (!m) return o;
      var i = m.call(o), r, ar = [], e;
      try {
          while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
      }
      catch (error) { e = { error: error }; }
      finally {
          try {
              if (r && !r.done && (m = i["return"])) m.call(i);
          }
          finally { if (e) throw e.error; }
      }
      return ar;
  };
  var __spreadArray = (undefined && undefined.__spreadArray) || function (to, from) {
      for (var i = 0, il = from.length, j = to.length; i < il; i++, j++)
          to[j] = from[i];
      return to;
  };
  function traverse(tree, walker, origin) {
      if (origin === void 0) { origin = []; }
      if (!tree) {
          return;
      }
      if (!isArray$1(tree)) {
          forEach(tree, function (subtree, key) {
              return traverse(subtree, walker, __spreadArray(__spreadArray([], __read(origin)), __read(parsePath(key))));
          });
          return;
      }
      var _a = __read(tree, 2), nodeValue = _a[0], children = _a[1];
      if (children) {
          forEach(children, function (child, key) {
              traverse(child, walker, __spreadArray(__spreadArray([], __read(origin)), __read(parsePath(key))));
          });
      }
      walker(nodeValue, origin);
  }
  function applyValueAnnotations(plain, annotations) {
      traverse(annotations, function (type, path) {
          plain = setDeep(plain, path, function (v) { return untransformValue(v, type); });
      });
      return plain;
  }
  function applyReferentialEqualityAnnotations(plain, annotations) {
      function apply(identicalPaths, path) {
          var object = getDeep(plain, parsePath(path));
          identicalPaths.map(parsePath).forEach(function (identicalObjectPath) {
              plain = setDeep(plain, identicalObjectPath, function () { return object; });
          });
      }
      if (isArray$1(annotations)) {
          var _a = __read(annotations, 2), root = _a[0], other = _a[1];
          root.forEach(function (identicalPath) {
              plain = setDeep(plain, parsePath(identicalPath), function () { return plain; });
          });
          if (other) {
              forEach(other, apply);
          }
      }
      else {
          forEach(annotations, apply);
      }
      return plain;
  }
  var isDeep = function (object) {
      return isPlainObject$1(object) ||
          isArray$1(object) ||
          isMap(object) ||
          isSet(object) ||
          isInstanceOfRegisteredClass(object);
  };
  function addIdentity(object, path, identities) {
      var existingSet = identities.get(object);
      if (existingSet) {
          existingSet.push(path);
      }
      else {
          identities.set(object, [path]);
      }
  }
  function generateReferentialEqualityAnnotations(identitites) {
      var result = {};
      var rootEqualityPaths = undefined;
      identitites.forEach(function (paths) {
          if (paths.length <= 1) {
              return;
          }
          var _a = __read(paths
              .map(function (path) { return path.map(String); })
              .sort(function (a, b) { return a.length - b.length; })), shortestPath = _a[0], identicalPaths = _a.slice(1);
          if (shortestPath.length === 0) {
              rootEqualityPaths = identicalPaths.map(stringifyPath);
          }
          else {
              result[stringifyPath(shortestPath)] = identicalPaths.map(stringifyPath);
          }
      });
      if (rootEqualityPaths) {
          if (isEmptyObject(result)) {
              return [rootEqualityPaths];
          }
          else {
              return [rootEqualityPaths, result];
          }
      }
      else {
          return isEmptyObject(result) ? undefined : result;
      }
  }
  var walker = function (object, identities, path, objectsInThisPath) {
      var _a;
      if (path === void 0) { path = []; }
      if (objectsInThisPath === void 0) { objectsInThisPath = []; }
      if (!isPrimitive(object)) {
          addIdentity(object, path, identities);
      }
      if (!isDeep(object)) {
          var transformed_1 = transformValue(object);
          if (transformed_1) {
              return {
                  transformedValue: transformed_1.value,
                  annotations: [transformed_1.type]
              };
          }
          else {
              return {
                  transformedValue: object
              };
          }
      }
      if (includes(objectsInThisPath, object)) {
          return {
              transformedValue: null
          };
      }
      var transformationResult = transformValue(object);
      var transformed = (_a = transformationResult === null || transformationResult === void 0 ? void 0 : transformationResult.value) !== null && _a !== void 0 ? _a : object;
      if (!isPrimitive(object)) {
          objectsInThisPath = __spreadArray(__spreadArray([], __read(objectsInThisPath)), [object]);
      }
      var transformedValue = isArray$1(transformed) ? [] : {};
      var innerAnnotations = {};
      forEach(transformed, function (value, index) {
          var recursiveResult = walker(value, identities, __spreadArray(__spreadArray([], __read(path)), [index]), objectsInThisPath);
          transformedValue[index] = recursiveResult.transformedValue;
          if (isArray$1(recursiveResult.annotations)) {
              innerAnnotations[index] = recursiveResult.annotations;
          }
          else if (isPlainObject$1(recursiveResult.annotations)) {
              forEach(recursiveResult.annotations, function (tree, key) {
                  innerAnnotations[escapeKey(index) + '.' + key] = tree;
              });
          }
      });
      if (isEmptyObject(innerAnnotations)) {
          return {
              transformedValue: transformedValue,
              annotations: !!transformationResult
                  ? [transformationResult.type]
                  : undefined
          };
      }
      else {
          return {
              transformedValue: transformedValue,
              annotations: !!transformationResult
                  ? [transformationResult.type, innerAnnotations]
                  : innerAnnotations
          };
      }
  };

  /**
   * Returns the object type of the given payload
   *
   * @param {*} payload
   * @returns {string}
   */
  function getType(payload) {
      return Object.prototype.toString.call(payload).slice(8, -1);
  }
  /**
   * Returns whether the payload is a plain JavaScript object (excluding special classes or objects with other prototypes)
   *
   * @param {*} payload
   * @returns {payload is PlainObject}
   */
  function isPlainObject(payload) {
      if (getType(payload) !== 'Object')
          return false;
      return payload.constructor === Object && Object.getPrototypeOf(payload) === Object.prototype;
  }
  /**
   * Returns whether the payload is an array
   *
   * @param {any} payload
   * @returns {payload is any[]}
   */
  function isArray(payload) {
      return getType(payload) === 'Array';
  }

  function assignProp(carry, key, newVal, originalObject, includeNonenumerable) {
      const propType = {}.propertyIsEnumerable.call(originalObject, key)
          ? 'enumerable'
          : 'nonenumerable';
      if (propType === 'enumerable')
          carry[key] = newVal;
      if (includeNonenumerable && propType === 'nonenumerable') {
          Object.defineProperty(carry, key, {
              value: newVal,
              enumerable: false,
              writable: true,
              configurable: true,
          });
      }
  }
  /**
   * Copy (clone) an object and all its props recursively to get rid of any prop referenced of the original object. Arrays are also cloned, however objects inside arrays are still linked.
   *
   * @export
   * @template T
   * @param {T} target Target can be anything
   * @param {Options} [options = {}] Options can be `props` or `nonenumerable`
   * @returns {T} the target with replaced values
   * @export
   */
  function copy(target, options = {}) {
      if (isArray(target)) {
          return target.map((item) => copy(item, options));
      }
      if (!isPlainObject(target)) {
          return target;
      }
      const props = Object.getOwnPropertyNames(target);
      const symbols = Object.getOwnPropertySymbols(target);
      return [...props, ...symbols].reduce((carry, key) => {
          if (isArray(options.props) && !options.props.includes(key)) {
              return carry;
          }
          const val = target[key];
          const newVal = copy(val, options);
          assignProp(carry, key, newVal, target, options.nonenumerable);
          return carry;
      }, {});
  }

  var __assign = (undefined && undefined.__assign) || function () {
      __assign = Object.assign || function(t) {
          for (var s, i = 1, n = arguments.length; i < n; i++) {
              s = arguments[i];
              for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                  t[p] = s[p];
          }
          return t;
      };
      return __assign.apply(this, arguments);
  };
  var serialize = function (object) {
      var identities = new Map();
      var output = walker(object, identities);
      var res = {
          json: output.transformedValue
      };
      if (output.annotations) {
          res.meta = __assign(__assign({}, res.meta), { values: output.annotations });
      }
      var equalityAnnotations = generateReferentialEqualityAnnotations(identities);
      if (equalityAnnotations) {
          res.meta = __assign(__assign({}, res.meta), { referentialEqualities: equalityAnnotations });
      }
      return res;
  };
  var deserialize = function (payload) {
      var json = payload.json, meta = payload.meta;
      var result = copy(json);
      if (meta === null || meta === void 0 ? void 0 : meta.values) {
          result = applyValueAnnotations(result, meta.values);
      }
      if (meta === null || meta === void 0 ? void 0 : meta.referentialEqualities) {
          result = applyReferentialEqualityAnnotations(result, meta.referentialEqualities);
      }
      return result;
  };
  var stringify = function (object) {
      return JSON.stringify(serialize(object));
  };
  var parse = function (string) {
      return deserialize(JSON.parse(string));
  };
  var registerClass = function (v, options) {
      return ClassRegistry.register(v, options);
  };
  var registerSymbol = function (v, identifier) {
      return SymbolRegistry.register(v, identifier);
  };
  var registerCustom = function (transformer, name) {
      return CustomTransformerRegistry.register(__assign({ name: name }, transformer));
  };
  var superjson = {
      stringify: stringify,
      parse: parse,
      serialize: serialize,
      deserialize: deserialize,
      registerClass: registerClass,
      registerSymbol: registerSymbol,
      registerCustom: registerCustom,
      allowErrorProps: allowErrorProps
  };

  const defaultTheme = {
    background: '#0b1521',
    backgroundAlt: '#132337',
    foreground: 'white',
    gray: '#3f4e60',
    grayAlt: '#222e3e',
    inputBackgroundColor: '#fff',
    inputTextColor: '#000',
    success: '#00ab52',
    danger: '#ff0085',
    active: '#006bff',
    paused: '#8c49eb',
    warning: '#ffb200'
  };
  const ThemeContext = /*#__PURE__*/React__namespace.createContext(defaultTheme);
  function ThemeProvider({
    theme,
    ...rest
  }) {
    return /*#__PURE__*/React__namespace.createElement(ThemeContext.Provider, _extends({
      value: theme
    }, rest));
  }
  function useTheme() {
    return React__namespace.useContext(ThemeContext);
  }

  function useMediaQuery(query) {
    // Keep track of the preference in state, start with the current match
    const [isMatch, setIsMatch] = React__namespace.useState(() => {
      if (typeof window !== 'undefined') {
        return window.matchMedia(query).matches;
      }

      return;
    }); // Watch for changes

    React__namespace.useEffect(() => {
      if (typeof window !== 'undefined') {
        // Create a matcher
        const matcher = window.matchMedia(query); // Create our handler

        const onChange = ({
          matches
        }) => setIsMatch(matches); // Listen for changes


        matcher.addListener(onChange);
        return () => {
          // Stop listening for changes
          matcher.removeListener(onChange);
        };
      }

      return;
    }, [isMatch, query, setIsMatch]);
    return isMatch;
  }

  function getQueryStatusColor({
    queryState,
    observerCount,
    isStale,
    theme
  }) {
    return queryState.fetchStatus === 'fetching' ? theme.active : !observerCount ? theme.gray : queryState.fetchStatus === 'paused' ? theme.paused : isStale ? theme.warning : theme.success;
  }
  function getQueryStatusLabel(query) {
    return query.state.fetchStatus === 'fetching' ? 'fetching' : !query.getObserversCount() ? 'inactive' : query.state.fetchStatus === 'paused' ? 'paused' : query.isStale() ? 'stale' : 'fresh';
  }
  function styled(type, newStyles, queries = {}) {
    return /*#__PURE__*/React__namespace.forwardRef(({
      style,
      ...rest
    }, ref) => {
      const theme = useTheme();
      const mediaStyles = Object.entries(queries).reduce((current, [key, value]) => {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        return useMediaQuery(key) ? { ...current,
          ...(typeof value === 'function' ? value(rest, theme) : value)
        } : current;
      }, {});
      return /*#__PURE__*/React__namespace.createElement(type, { ...rest,
        style: { ...(typeof newStyles === 'function' ? newStyles(rest, theme) : newStyles),
          ...style,
          ...mediaStyles
        },
        ref
      });
    });
  }
  function useIsMounted() {
    const mountedRef = React__namespace.useRef(false);
    const isMounted = React__namespace.useCallback(() => mountedRef.current, []);
    React__namespace.useEffect(() => {
      mountedRef.current = true;
      return () => {
        mountedRef.current = false;
      };
    }, []);
    return isMounted;
  }
  /**
   * Displays a string regardless the type of the data
   * @param {unknown} value Value to be stringified
   * @param {boolean} beautify Formats json to multiline
   */

  const displayValue = (value, beautify = false) => {
    const {
      json
    } = superjson.serialize(value);
    return JSON.stringify(json, null, beautify ? 2 : undefined);
  }; // Sorting functions

  const getStatusRank = q => q.state.fetchStatus !== 'idle' ? 0 : !q.getObserversCount() ? 3 : q.isStale() ? 2 : 1;

  const queryHashSort = (a, b) => a.queryHash.localeCompare(b.queryHash);

  const dateSort = (a, b) => a.state.dataUpdatedAt < b.state.dataUpdatedAt ? 1 : -1;

  const statusAndDateSort = (a, b) => {
    if (getStatusRank(a) === getStatusRank(b)) {
      return dateSort(a, b);
    }

    return getStatusRank(a) > getStatusRank(b) ? 1 : -1;
  };

  const sortFns = {
    'Status > Last Updated': statusAndDateSort,
    'Query Hash': queryHashSort,
    'Last Updated': dateSort
  };
  const minPanelSize = 70;
  const defaultPanelSize = 500;
  const sides = {
    top: 'bottom',
    bottom: 'top',
    left: 'right',
    right: 'left'
  };

  /**
   * Check if the given side is vertical (left/right)
   */
  function isVerticalSide(side) {
    return ['left', 'right'].includes(side);
  }
  /**
   * Get the opposite side, eg 'left' => 'right'. 'top' => 'bottom', etc
   */

  function getOppositeSide(side) {
    return sides[side];
  }
  /**
   * Given as css prop it will return a sided css prop based on a given side
   * Example given `border` and `right` it return `borderRight`
   */

  function getSidedProp(prop, side) {
    return "" + prop + (side.charAt(0).toUpperCase() + side.slice(1));
  }
  function getSidePanelStyle({
    position = 'bottom',
    height,
    width,
    devtoolsTheme,
    isOpen,
    isResizing,
    panelStyle
  }) {
    const oppositeSide = getOppositeSide(position);
    const borderSide = getSidedProp('border', oppositeSide);
    const isVertical = isVerticalSide(position);
    return { ...panelStyle,
      direction: 'ltr',
      position: 'fixed',
      [position]: 0,
      [borderSide]: "1px solid " + devtoolsTheme.gray,
      transformOrigin: oppositeSide,
      boxShadow: '0 0 20px rgba(0,0,0,.3)',
      zIndex: 99999,
      // visibility will be toggled after transitions, but set initial state here
      visibility: isOpen ? 'visible' : 'hidden',
      ...(isResizing ? {
        transition: "none"
      } : {
        transition: "all .2s ease"
      }),
      ...(isOpen ? {
        opacity: 1,
        pointerEvents: 'all',
        transform: isVertical ? "translateX(0) scale(1)" : "translateY(0) scale(1)"
      } : {
        opacity: 0,
        pointerEvents: 'none',
        transform: isVertical ? "translateX(15px) scale(1.02)" : "translateY(15px) scale(1.02)"
      }),
      ...(isVertical ? {
        top: 0,
        height: '100vh',
        maxWidth: '90%',
        width: typeof width === 'number' && width >= minPanelSize ? width : defaultPanelSize
      } : {
        left: 0,
        width: '100%',
        maxHeight: '90%',
        height: typeof height === 'number' && height >= minPanelSize ? height : defaultPanelSize
      })
    };
  }
  /**
   * Get resize handle style based on a given side
   */

  function getResizeHandleStyle(position = 'bottom') {
    const isVertical = isVerticalSide(position);
    const oppositeSide = getOppositeSide(position);
    const marginSide = getSidedProp('margin', oppositeSide);
    return {
      position: 'absolute',
      cursor: isVertical ? 'col-resize' : 'row-resize',
      zIndex: 100000,
      [oppositeSide]: 0,
      [marginSide]: "-4px",
      ...(isVertical ? {
        top: 0,
        height: '100%',
        width: '4px'
      } : {
        width: '100%',
        height: '4px'
      })
    };
  }

  const Panel = styled('div', (_props, theme) => ({
    fontSize: 'clamp(12px, 1.5vw, 14px)',
    fontFamily: "sans-serif",
    display: 'flex',
    backgroundColor: theme.background,
    color: theme.foreground
  }), {
    '(max-width: 700px)': {
      flexDirection: 'column'
    },
    '(max-width: 600px)': {
      fontSize: '.9em' // flexDirection: 'column',

    }
  });
  const ActiveQueryPanel = styled('div', () => ({
    flex: '1 1 500px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'auto',
    height: '100%'
  }), {
    '(max-width: 700px)': (_props, theme) => ({
      borderTop: "2px solid " + theme.gray
    })
  });
  const Button = styled('button', (props, theme) => ({
    appearance: 'none',
    fontSize: '.9em',
    fontWeight: 'bold',
    background: theme.gray,
    border: '0',
    borderRadius: '.3em',
    color: 'white',
    padding: '.5em',
    opacity: props.disabled ? '.5' : undefined,
    cursor: 'pointer'
  }));
  const QueryKeys = styled('span', {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5em',
    fontSize: '0.9em'
  });
  const QueryKey = styled('span', {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '.2em .4em',
    fontWeight: 'bold',
    textShadow: '0 0 10px black',
    borderRadius: '.2em'
  });
  const Code = styled('code', {
    fontSize: '.9em',
    color: 'inherit',
    background: 'inherit'
  });
  const Input = styled('input', (_props, theme) => ({
    backgroundColor: theme.inputBackgroundColor,
    border: 0,
    borderRadius: '.2em',
    color: theme.inputTextColor,
    fontSize: '.9em',
    lineHeight: "1.3",
    padding: '.3em .4em'
  }));
  const Select = styled('select', (_props, theme) => ({
    display: "inline-block",
    fontSize: ".9em",
    fontFamily: "sans-serif",
    fontWeight: 'normal',
    lineHeight: "1.3",
    padding: ".3em 1.5em .3em .5em",
    height: 'auto',
    border: 0,
    borderRadius: ".2em",
    appearance: "none",
    WebkitAppearance: 'none',
    backgroundColor: theme.inputBackgroundColor,
    backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' fill='%23444444'><polygon points='0,25 100,25 50,75'/></svg>\")",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right .55em center",
    backgroundSize: ".65em auto, 100%",
    color: theme.inputTextColor
  }), {
    '(max-width: 500px)': {
      display: 'none'
    }
  });

  function ScreenReader({
    text
  }) {
    return /*#__PURE__*/React__namespace.createElement("span", {
      style: {
        position: 'absolute',
        width: '0.1px',
        height: '0.1px',
        overflow: 'hidden'
      }
    }, text);
  }

  const Entry = styled('div', {
    fontFamily: 'Menlo, monospace',
    fontSize: '1em',
    lineHeight: '1.7',
    outline: 'none',
    wordBreak: 'break-word'
  });
  const Label = styled('span', {
    color: 'white'
  });
  const LabelButton = styled('button', {
    cursor: 'pointer',
    color: 'white'
  });
  const ExpandButton = styled('button', {
    cursor: 'pointer',
    color: 'inherit',
    font: 'inherit',
    outline: 'inherit',
    background: 'transparent',
    border: 'none',
    padding: 0
  });
  const CopyButton = ({
    value
  }) => {
    const [copyState, setCopyState] = React__namespace.useState('NoCopy');
    return /*#__PURE__*/React__namespace.createElement("button", {
      onClick: copyState === 'NoCopy' ? () => {
        navigator.clipboard.writeText(superjson.stringify(value)).then(() => {
          setCopyState('SuccessCopy');
          setTimeout(() => {
            setCopyState('NoCopy');
          }, 1500);
        }, err => {
          console.error('Failed to copy: ', err);
          setCopyState('ErrorCopy');
          setTimeout(() => {
            setCopyState('NoCopy');
          }, 1500);
        });
      } : undefined,
      style: {
        cursor: 'pointer',
        color: 'inherit',
        font: 'inherit',
        outline: 'inherit',
        background: 'transparent',
        border: 'none',
        padding: 0
      }
    }, copyState === 'NoCopy' ? /*#__PURE__*/React__namespace.createElement(Copier, null) : copyState === 'SuccessCopy' ? /*#__PURE__*/React__namespace.createElement(CopiedCopier, null) : /*#__PURE__*/React__namespace.createElement(ErrorCopier, null));
  };
  const Value = styled('span', (_props, theme) => ({
    color: theme.danger
  }));
  const SubEntries = styled('div', {
    marginLeft: '.1em',
    paddingLeft: '1em',
    borderLeft: '2px solid rgba(0,0,0,.15)'
  });
  const Info = styled('span', {
    color: 'grey',
    fontSize: '.7em'
  });
  const Expander = ({
    expanded,
    style = {}
  }) => /*#__PURE__*/React__namespace.createElement("span", {
    style: {
      display: 'inline-block',
      transition: 'all .1s ease',
      transform: "rotate(" + (expanded ? 90 : 0) + "deg) " + (style.transform || ''),
      ...style
    }
  }, "\u25B6");

  const Copier = () => /*#__PURE__*/React__namespace.createElement("span", {
    "aria-label": "Copy object to clipboard",
    title: "Copy object to clipboard",
    style: {
      paddingLeft: '1em'
    }
  }, /*#__PURE__*/React__namespace.createElement("svg", {
    height: "12",
    viewBox: "0 0 16 12",
    width: "10"
  }, /*#__PURE__*/React__namespace.createElement("path", {
    fill: "currentColor",
    d: "M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z"
  }), /*#__PURE__*/React__namespace.createElement("path", {
    fill: "currentColor",
    d: "M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z"
  })));

  const ErrorCopier = () => /*#__PURE__*/React__namespace.createElement("span", {
    "aria-label": "Failed copying to clipboard",
    title: "Failed copying to clipboard",
    style: {
      paddingLeft: '1em',
      display: 'flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React__namespace.createElement("svg", {
    height: "12",
    viewBox: "0 0 16 12",
    width: "10",
    display: "block"
  }, /*#__PURE__*/React__namespace.createElement("path", {
    fill: "red",
    d: "M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"
  })), /*#__PURE__*/React__namespace.createElement("span", {
    style: {
      color: 'red',
      fontSize: '12px',
      paddingLeft: '4px',
      position: 'relative',
      top: '2px'
    }
  }, "See console"));

  const CopiedCopier = () => /*#__PURE__*/React__namespace.createElement("span", {
    "aria-label": "Object copied to clipboard",
    title: "Object copied to clipboard",
    style: {
      paddingLeft: '1em',
      display: 'inline-block',
      verticalAlign: 'middle'
    }
  }, /*#__PURE__*/React__namespace.createElement("svg", {
    height: "16",
    viewBox: "0 0 16 16",
    width: "16",
    display: "block"
  }, /*#__PURE__*/React__namespace.createElement("path", {
    fill: "green",
    d: "M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"
  })));

  /**
   * Chunk elements in the array by size
   *
   * when the array cannot be chunked evenly by size, the last chunk will be
   * filled with the remaining elements
   *
   * @example
   * chunkArray(['a','b', 'c', 'd', 'e'], 2) // returns [['a','b'], ['c', 'd'], ['e']]
   */
  function chunkArray(array, size) {
    if (size < 1) return [];
    let i = 0;
    const result = [];

    while (i < array.length) {
      result.push(array.slice(i, i + size));
      i = i + size;
    }

    return result;
  }
  const DefaultRenderer = ({
    handleEntry,
    label,
    value,
    subEntries = [],
    subEntryPages = [],
    type,
    expanded = false,
    copyable = false,
    toggleExpanded,
    pageSize
  }) => {
    const [expandedPages, setExpandedPages] = React__namespace.useState([]);
    return /*#__PURE__*/React__namespace.createElement(Entry, {
      key: label
    }, subEntryPages.length ? /*#__PURE__*/React__namespace.createElement(React__namespace.Fragment, null, /*#__PURE__*/React__namespace.createElement(ExpandButton, {
      onClick: () => toggleExpanded()
    }, /*#__PURE__*/React__namespace.createElement(Expander, {
      expanded: expanded
    }), " ", label, ' ', /*#__PURE__*/React__namespace.createElement(Info, null, String(type).toLowerCase() === 'iterable' ? '(Iterable) ' : '', subEntries.length, " ", subEntries.length > 1 ? "items" : "item")), copyable ? /*#__PURE__*/React__namespace.createElement(CopyButton, {
      value: value
    }) : null, expanded ? subEntryPages.length === 1 ? /*#__PURE__*/React__namespace.createElement(SubEntries, null, subEntries.map(handleEntry)) : /*#__PURE__*/React__namespace.createElement(SubEntries, null, subEntryPages.map((entries, index) => /*#__PURE__*/React__namespace.createElement("div", {
      key: index
    }, /*#__PURE__*/React__namespace.createElement(Entry, null, /*#__PURE__*/React__namespace.createElement(LabelButton, {
      onClick: () => setExpandedPages(old => old.includes(index) ? old.filter(d => d !== index) : [...old, index])
    }, /*#__PURE__*/React__namespace.createElement(Expander, {
      expanded: expanded
    }), " [", index * pageSize, " ...", ' ', index * pageSize + pageSize - 1, "]"), expandedPages.includes(index) ? /*#__PURE__*/React__namespace.createElement(SubEntries, null, entries.map(handleEntry)) : null)))) : null) : /*#__PURE__*/React__namespace.createElement(React__namespace.Fragment, null, /*#__PURE__*/React__namespace.createElement(Label, null, label, ":"), " ", /*#__PURE__*/React__namespace.createElement(Value, null, displayValue(value))));
  };

  function isIterable(x) {
    return Symbol.iterator in x;
  }

  function Explorer({
    value,
    defaultExpanded,
    renderer = DefaultRenderer,
    pageSize = 100,
    copyable = false,
    ...rest
  }) {
    const [expanded, setExpanded] = React__namespace.useState(Boolean(defaultExpanded));
    const toggleExpanded = React__namespace.useCallback(() => setExpanded(old => !old), []);
    let type = typeof value;
    let subEntries = [];

    const makeProperty = sub => {
      const subDefaultExpanded = defaultExpanded === true ? {
        [sub.label]: true
      } : defaultExpanded == null ? void 0 : defaultExpanded[sub.label];
      return { ...sub,
        defaultExpanded: subDefaultExpanded
      };
    };

    if (Array.isArray(value)) {
      type = 'array';
      subEntries = value.map((d, i) => makeProperty({
        label: i.toString(),
        value: d
      }));
    } else if (value !== null && typeof value === 'object' && isIterable(value) && typeof value[Symbol.iterator] === 'function') {
      type = 'Iterable';
      subEntries = Array.from(value, (val, i) => makeProperty({
        label: i.toString(),
        value: val
      }));
    } else if (typeof value === 'object' && value !== null) {
      type = 'object';
      subEntries = Object.entries(value).map(([key, val]) => makeProperty({
        label: key,
        value: val
      }));
    }

    const subEntryPages = chunkArray(subEntries, pageSize);
    return renderer({
      handleEntry: entry => /*#__PURE__*/React__namespace.createElement(Explorer, _extends({
        key: entry.label,
        value: value,
        renderer: renderer,
        copyable: copyable
      }, rest, entry)),
      type,
      subEntries,
      subEntryPages,
      value,
      expanded,
      copyable,
      toggleExpanded,
      pageSize,
      ...rest
    });
  }

  function Logo(props) {
    return /*#__PURE__*/React__namespace.createElement("svg", _extends({
      width: "40px",
      height: "40px",
      viewBox: "0 0 190 190",
      version: "1.1"
    }, props), /*#__PURE__*/React__namespace.createElement("g", {
      stroke: "none",
      strokeWidth: "1",
      fill: "none",
      fillRule: "evenodd"
    }, /*#__PURE__*/React__namespace.createElement("g", {
      transform: "translate(-33.000000, 0.000000)"
    }, /*#__PURE__*/React__namespace.createElement("path", {
      d: "M72.7239712,61.3436237 C69.631224,46.362877 68.9675112,34.8727722 70.9666331,26.5293551 C72.1555965,21.5671678 74.3293088,17.5190846 77.6346064,14.5984631 C81.1241394,11.5150478 85.5360327,10.0020122 90.493257,10.0020122 C98.6712013,10.0020122 107.26826,13.7273214 116.455725,20.8044264 C120.20312,23.6910458 124.092437,27.170411 128.131651,31.2444746 C128.45314,30.8310265 128.816542,30.4410453 129.22143,30.0806152 C140.64098,19.9149716 150.255245,13.5989272 158.478408,11.1636507 C163.367899,9.715636 167.958526,9.57768202 172.138936,10.983031 C176.551631,12.4664684 180.06766,15.5329489 182.548314,19.8281091 C186.642288,26.9166735 187.721918,36.2310983 186.195595,47.7320243 C185.573451,52.4199112 184.50985,57.5263831 183.007094,63.0593153 C183.574045,63.1277086 184.142416,63.2532808 184.705041,63.4395297 C199.193932,68.2358678 209.453582,73.3937462 215.665021,79.2882839 C219.360669,82.7953831 221.773972,86.6998434 222.646365,91.0218204 C223.567176,95.5836746 222.669313,100.159332 220.191548,104.451297 C216.105211,111.529614 208.591643,117.11221 197.887587,121.534031 C193.589552,123.309539 188.726579,124.917559 183.293259,126.363748 C183.541176,126.92292 183.733521,127.516759 183.862138,128.139758 C186.954886,143.120505 187.618598,154.61061 185.619477,162.954027 C184.430513,167.916214 182.256801,171.964297 178.951503,174.884919 C175.46197,177.968334 171.050077,179.48137 166.092853,179.48137 C157.914908,179.48137 149.31785,175.756061 140.130385,168.678956 C136.343104,165.761613 132.410866,162.238839 128.325434,158.108619 C127.905075,158.765474 127.388968,159.376011 126.77857,159.919385 C115.35902,170.085028 105.744755,176.401073 97.5215915,178.836349 C92.6321009,180.284364 88.0414736,180.422318 83.8610636,179.016969 C79.4483686,177.533532 75.9323404,174.467051 73.4516862,170.171891 C69.3577116,163.083327 68.2780823,153.768902 69.8044053,142.267976 C70.449038,137.410634 71.56762,132.103898 73.1575891,126.339009 C72.5361041,126.276104 71.9120754,126.144816 71.2949591,125.940529 C56.8060684,121.144191 46.5464184,115.986312 40.3349789,110.091775 C36.6393312,106.584675 34.2260275,102.680215 33.3536352,98.3582381 C32.4328237,93.7963839 33.3306866,89.2207269 35.8084524,84.9287618 C39.8947886,77.8504443 47.4083565,72.2678481 58.1124133,67.8460273 C62.5385143,66.0176154 67.5637208,64.366822 73.1939394,62.8874674 C72.9933393,62.3969171 72.8349374,61.8811235 72.7239712,61.3436237 Z",
      fill: "#002C4B",
      fillRule: "nonzero",
      transform: "translate(128.000000, 95.000000) scale(-1, 1) translate(-128.000000, -95.000000) "
    }), /*#__PURE__*/React__namespace.createElement("path", {
      d: "M113.396882,64 L142.608177,64 C144.399254,64 146.053521,64.958025 146.944933,66.5115174 L161.577138,92.0115174 C162.461464,93.5526583 162.461464,95.4473417 161.577138,96.9884826 L146.944933,122.488483 C146.053521,124.041975 144.399254,125 142.608177,125 L113.396882,125 C111.605806,125 109.951539,124.041975 109.060126,122.488483 L94.4279211,96.9884826 C93.543596,95.4473417 93.543596,93.5526583 94.4279211,92.0115174 L109.060126,66.5115174 C109.951539,64.958025 111.605806,64 113.396882,64 Z M138.987827,70.2765273 C140.779849,70.2765273 142.434839,71.2355558 143.325899,72.7903404 L154.343038,92.0138131 C155.225607,93.5537825 155.225607,95.4462175 154.343038,96.9861869 L143.325899,116.20966 C142.434839,117.764444 140.779849,118.723473 138.987827,118.723473 L117.017233,118.723473 C115.225211,118.723473 113.570221,117.764444 112.67916,116.20966 L101.662022,96.9861869 C100.779452,95.4462175 100.779452,93.5537825 101.662022,92.0138131 L112.67916,72.7903404 C113.570221,71.2355558 115.225211,70.2765273 117.017233,70.2765273 L138.987827,70.2765273 Z M135.080648,77.1414791 L120.924411,77.1414791 C119.134228,77.1414791 117.480644,78.0985567 116.5889,79.6508285 L116.5889,79.6508285 L109.489217,92.0093494 C108.603232,93.5515958 108.603232,95.4484042 109.489217,96.9906506 L109.489217,96.9906506 L116.5889,109.349172 C117.480644,110.901443 119.134228,111.858521 120.924411,111.858521 L120.924411,111.858521 L135.080648,111.858521 C136.870831,111.858521 138.524416,110.901443 139.41616,109.349172 L139.41616,109.349172 L146.515843,96.9906506 C147.401828,95.4484042 147.401828,93.5515958 146.515843,92.0093494 L146.515843,92.0093494 L139.41616,79.6508285 C138.524416,78.0985567 136.870831,77.1414791 135.080648,77.1414791 L135.080648,77.1414791 Z M131.319186,83.7122186 C133.108028,83.7122186 134.760587,84.6678753 135.652827,86.2183156 L138.983552,92.0060969 C139.87203,93.5500005 139.87203,95.4499995 138.983552,96.9939031 L135.652827,102.781684 C134.760587,104.332125 133.108028,105.287781 131.319186,105.287781 L124.685874,105.287781 C122.897032,105.287781 121.244473,104.332125 120.352233,102.781684 L117.021508,96.9939031 C116.13303,95.4499995 116.13303,93.5500005 117.021508,92.0060969 L120.352233,86.2183156 C121.244473,84.6678753 122.897032,83.7122186 124.685874,83.7122186 L131.319186,83.7122186 Z M128.003794,90.1848875 C126.459294,90.1848875 125.034382,91.0072828 124.263005,92.3424437 C123.491732,93.6774232 123.491732,95.3225768 124.263005,96.6575563 C125.034382,97.9927172 126.459294,98.8151125 128.001266,98.8151125 L128.001266,98.8151125 C129.545766,98.8151125 130.970678,97.9927172 131.742055,96.6575563 C132.513327,95.3225768 132.513327,93.6774232 131.742055,92.3424437 C130.970678,91.0072828 129.545766,90.1848875 128.003794,90.1848875 L128.003794,90.1848875 Z M93,94.5009646 L100.767764,94.5009646",
      fill: "#FFD94C"
    }), /*#__PURE__*/React__namespace.createElement("path", {
      d: "M87.8601729,108.357758 C89.1715224,107.608286 90.8360246,108.074601 91.5779424,109.399303 L91.5779424,109.399303 L92.0525843,110.24352 C95.8563392,116.982993 99.8190116,123.380176 103.940602,129.435068 C108.807881,136.585427 114.28184,143.82411 120.362479,151.151115 C121.316878,152.30114 121.184944,154.011176 120.065686,154.997937 L120.065686,154.997937 L119.454208,155.534625 C99.3465389,173.103314 86.2778188,176.612552 80.2480482,166.062341 C74.3500652,155.742717 76.4844915,136.982888 86.6513274,109.782853 C86.876818,109.179582 87.3045861,108.675291 87.8601729,108.357758 Z M173.534177,129.041504 C174.986131,128.785177 176.375496,129.742138 176.65963,131.194242 L176.65963,131.194242 L176.812815,131.986376 C181.782365,157.995459 178.283348,171 166.315764,171 C154.609745,171 139.708724,159.909007 121.612702,137.727022 C121.211349,137.235047 120.994572,136.617371 121,135.981509 C121.013158,134.480686 122.235785,133.274651 123.730918,133.287756 L123.730918,133.287756 L124.684654,133.294531 C132.305698,133.335994 139.714387,133.071591 146.910723,132.501323 C155.409039,131.82788 164.283523,130.674607 173.534177,129.041504 Z M180.408726,73.8119663 C180.932139,72.4026903 182.508386,71.6634537 183.954581,72.149012 L183.954581,72.149012 L184.742552,72.4154854 C210.583763,81.217922 220.402356,90.8916805 214.198332,101.436761 C208.129904,111.751366 190.484347,119.260339 161.26166,123.963678 C160.613529,124.067994 159.948643,123.945969 159.382735,123.618843 C158.047025,122.846729 157.602046,121.158214 158.388848,119.847438 L158.388848,119.847438 L158.889328,119.0105 C162.877183,112.31633 166.481358,105.654262 169.701854,99.0242957 C173.50501,91.1948179 177.073967,82.7907081 180.408726,73.8119663 Z M94.7383398,66.0363218 C95.3864708,65.9320063 96.0513565,66.0540315 96.6172646,66.3811573 C97.9529754,67.153271 98.3979538,68.8417862 97.6111517,70.1525615 L97.6111517,70.1525615 L97.1106718,70.9895001 C93.1228168,77.6836699 89.5186416,84.3457379 86.2981462,90.9757043 C82.49499,98.8051821 78.9260328,107.209292 75.5912744,116.188034 C75.0678608,117.59731 73.4916142,118.336546 72.045419,117.850988 L72.045419,117.850988 L71.2574475,117.584515 C45.4162372,108.782078 35.597644,99.1083195 41.8016679,88.5632391 C47.8700957,78.2486335 65.515653,70.7396611 94.7383398,66.0363218 Z M136.545792,34.4653746 C156.653461,16.8966864 169.722181,13.3874478 175.751952,23.9376587 C181.649935,34.2572826 179.515508,53.0171122 169.348673,80.2171474 C169.123182,80.8204179 168.695414,81.324709 168.139827,81.6422422 C166.828478,82.3917144 165.163975,81.9253986 164.422058,80.6006966 L164.422058,80.6006966 L163.947416,79.7564798 C160.143661,73.0170065 156.180988,66.6198239 152.059398,60.564932 C147.192119,53.4145727 141.71816,46.1758903 135.637521,38.8488847 C134.683122,37.6988602 134.815056,35.9888243 135.934314,35.0020629 L135.934314,35.0020629 Z M90.6842361,18 C102.390255,18 117.291276,29.0909926 135.387298,51.2729777 C135.788651,51.7649527 136.005428,52.3826288 136,53.0184911 C135.986842,54.5193144 134.764215,55.7253489 133.269082,55.7122445 L133.269082,55.7122445 L132.315346,55.7054689 C124.694302,55.6640063 117.285613,55.9284091 110.089277,56.4986773 C101.590961,57.17212 92.7164767,58.325393 83.4658235,59.9584962 C82.0138691,60.2148231 80.6245044,59.2578618 80.3403697,57.805758 L80.3403697,57.805758 L80.1871846,57.0136235 C75.2176347,31.0045412 78.7166519,18 90.6842361,18 Z",
      fill: "#FF4154"
    }))));
  }

  function ReactQueryDevtools$1({
    initialIsOpen,
    panelProps = {},
    closeButtonProps = {},
    toggleButtonProps = {},
    position = 'bottom-left',
    containerElement: Container = 'aside',
    context,
    styleNonce,
    panelPosition: initialPanelPosition = 'bottom',
    errorTypes = []
  }) {
    const rootRef = React__namespace.useRef(null);
    const panelRef = React__namespace.useRef(null);
    const [isOpen, setIsOpen] = useLocalStorage('reactQueryDevtoolsOpen', initialIsOpen);
    const [devtoolsHeight, setDevtoolsHeight] = useLocalStorage('reactQueryDevtoolsHeight', defaultPanelSize);
    const [devtoolsWidth, setDevtoolsWidth] = useLocalStorage('reactQueryDevtoolsWidth', defaultPanelSize);
    const [panelPosition = 'bottom', setPanelPosition] = useLocalStorage('reactQueryDevtoolsPanelPosition', initialPanelPosition);
    const [isResolvedOpen, setIsResolvedOpen] = React__namespace.useState(false);
    const [isResizing, setIsResizing] = React__namespace.useState(false);
    const isMounted = useIsMounted();

    const handleDragStart = (panelElement, startEvent) => {
      if (!panelElement) return;
      if (startEvent.button !== 0) return; // Only allow left click for drag

      const isVertical = isVerticalSide(panelPosition);
      setIsResizing(true);
      const {
        height,
        width
      } = panelElement.getBoundingClientRect();
      const startX = startEvent.clientX;
      const startY = startEvent.clientY;
      let newSize = 0;

      const run = moveEvent => {
        // prevent mouse selecting stuff with mouse drag
        moveEvent.preventDefault(); // calculate the correct size based on mouse position and current panel position
        // hint: it is different formula for the opposite sides

        if (isVertical) {
          newSize = width + (panelPosition === 'right' ? startX - moveEvent.clientX : moveEvent.clientX - startX);
          setDevtoolsWidth(newSize);
        } else {
          newSize = height + (panelPosition === 'bottom' ? startY - moveEvent.clientY : moveEvent.clientY - startY);
          setDevtoolsHeight(newSize);
        }

        if (newSize < minPanelSize) {
          setIsOpen(false);
        } else {
          setIsOpen(true);
        }
      };

      const unsub = () => {
        if (isResizing) {
          setIsResizing(false);
        }

        document.removeEventListener('mousemove', run, false);
        document.removeEventListener('mouseUp', unsub, false);
      };

      document.addEventListener('mousemove', run, false);
      document.addEventListener('mouseup', unsub, false);
    };

    React__namespace.useEffect(() => {
      setIsResolvedOpen(isOpen != null ? isOpen : false);
    }, [isOpen, isResolvedOpen, setIsResolvedOpen]); // Toggle panel visibility before/after transition (depending on direction).
    // Prevents focusing in a closed panel.

    React__namespace.useEffect(() => {
      const ref = panelRef.current;

      if (ref) {
        const handlePanelTransitionStart = () => {
          if (isResolvedOpen) {
            ref.style.visibility = 'visible';
          }
        };

        const handlePanelTransitionEnd = () => {
          if (!isResolvedOpen) {
            ref.style.visibility = 'hidden';
          }
        };

        ref.addEventListener('transitionstart', handlePanelTransitionStart);
        ref.addEventListener('transitionend', handlePanelTransitionEnd);
        return () => {
          ref.removeEventListener('transitionstart', handlePanelTransitionStart);
          ref.removeEventListener('transitionend', handlePanelTransitionEnd);
        };
      }

      return;
    }, [isResolvedOpen]);
    React__namespace.useEffect(() => {
      var _rootRef$current;

      if (isResolvedOpen && (_rootRef$current = rootRef.current) != null && _rootRef$current.parentElement) {
        const {
          parentElement
        } = rootRef.current;
        const styleProp = getSidedProp('padding', panelPosition);
        const isVertical = isVerticalSide(panelPosition);

        const previousPaddings = (({
          padding,
          paddingTop,
          paddingBottom,
          paddingLeft,
          paddingRight
        }) => ({
          padding,
          paddingTop,
          paddingBottom,
          paddingLeft,
          paddingRight
        }))(parentElement.style);

        const run = () => {
          // reset the padding
          parentElement.style.padding = '0px';
          parentElement.style.paddingTop = '0px';
          parentElement.style.paddingBottom = '0px';
          parentElement.style.paddingLeft = '0px';
          parentElement.style.paddingRight = '0px'; // set the new padding based on the new panel position

          parentElement.style[styleProp] = (isVertical ? devtoolsWidth : devtoolsHeight) + "px";
        };

        run();

        if (typeof window !== 'undefined') {
          window.addEventListener('resize', run);
          return () => {
            window.removeEventListener('resize', run);
            Object.entries(previousPaddings).forEach(([property, previousValue]) => {
              parentElement.style[property] = previousValue;
            });
          };
        }
      }

      return;
    }, [isResolvedOpen, panelPosition, devtoolsHeight, devtoolsWidth]);
    const {
      style: panelStyle = {},
      ...otherPanelProps
    } = panelProps;
    const {
      style: toggleButtonStyle = {},
      onClick: onToggleClick,
      ...otherToggleButtonProps
    } = toggleButtonProps; // get computed style based on panel position

    const style = getSidePanelStyle({
      position: panelPosition,
      devtoolsTheme: defaultTheme,
      isOpen: isResolvedOpen,
      height: devtoolsHeight,
      width: devtoolsWidth,
      isResizing,
      panelStyle
    }); // Do not render on the server

    if (!isMounted()) return null;
    return /*#__PURE__*/React__namespace.createElement(Container, {
      ref: rootRef,
      className: "ReactQueryDevtools",
      "aria-label": "React Query Devtools"
    }, /*#__PURE__*/React__namespace.createElement(ThemeProvider, {
      theme: defaultTheme
    }, /*#__PURE__*/React__namespace.createElement(ReactQueryDevtoolsPanel$1, _extends({
      ref: panelRef,
      context: context,
      styleNonce: styleNonce,
      position: panelPosition,
      onPositionChange: setPanelPosition,
      showCloseButton: true,
      closeButtonProps: closeButtonProps
    }, otherPanelProps, {
      style: style,
      isOpen: isResolvedOpen,
      setIsOpen: setIsOpen,
      onDragStart: e => handleDragStart(panelRef.current, e),
      errorTypes: errorTypes
    }))), !isResolvedOpen ? /*#__PURE__*/React__namespace.createElement("button", _extends({
      type: "button"
    }, otherToggleButtonProps, {
      "aria-label": "Open React Query Devtools",
      "aria-controls": "ReactQueryDevtoolsPanel",
      "aria-haspopup": "true",
      "aria-expanded": "false",
      onClick: e => {
        setIsOpen(true);
        onToggleClick == null ? void 0 : onToggleClick(e);
      },
      style: {
        background: 'none',
        border: 0,
        padding: 0,
        position: 'fixed',
        zIndex: 99999,
        display: 'inline-flex',
        fontSize: '1.5em',
        margin: '.5em',
        cursor: 'pointer',
        width: 'fit-content',
        ...(position === 'top-right' ? {
          top: '0',
          right: '0'
        } : position === 'top-left' ? {
          top: '0',
          left: '0'
        } : position === 'bottom-right' ? {
          bottom: '0',
          right: '0'
        } : {
          bottom: '0',
          left: '0'
        }),
        ...toggleButtonStyle
      }
    }), /*#__PURE__*/React__namespace.createElement(Logo, {
      "aria-hidden": true
    }), /*#__PURE__*/React__namespace.createElement(ScreenReader, {
      text: "Open React Query Devtools"
    })) : null);
  }

  const useSubscribeToQueryCache = (queryCache, getSnapshot, skip = false) => {
    return shim.exports.useSyncExternalStore(React__namespace.useCallback(onStoreChange => {
      if (!skip) return queryCache.subscribe(reactQuery.notifyManager.batchCalls(onStoreChange));
      return () => {
        return;
      };
    }, [queryCache, skip]), getSnapshot, getSnapshot);
  };

  const ReactQueryDevtoolsPanel$1 = /*#__PURE__*/React__namespace.forwardRef(function ReactQueryDevtoolsPanel(props, ref) {
    const {
      isOpen = true,
      styleNonce,
      setIsOpen,
      context,
      onDragStart,
      onPositionChange,
      showCloseButton,
      position,
      closeButtonProps = {},
      errorTypes = [],
      ...panelProps
    } = props;
    const {
      onClick: onCloseClick,
      ...otherCloseButtonProps
    } = closeButtonProps;
    const queryClient = reactQuery.useQueryClient({
      context
    });
    const queryCache = queryClient.getQueryCache();
    const [sort, setSort] = useLocalStorage('reactQueryDevtoolsSortFn', Object.keys(sortFns)[0]);
    const [filter, setFilter] = useLocalStorage('reactQueryDevtoolsFilter', '');
    const [baseSort, setBaseSort] = useLocalStorage('reactQueryDevtoolsBaseSort', 1);
    const sortFn = React__namespace.useMemo(() => sortFns[sort], [sort]);
    const queriesCount = useSubscribeToQueryCache(queryCache, () => queryCache.getAll().length, !isOpen);
    const [activeQueryHash, setActiveQueryHash] = useLocalStorage('reactQueryDevtoolsActiveQueryHash', '');
    const queries = React__namespace.useMemo(() => {
      const unsortedQueries = queryCache.getAll();

      if (queriesCount === 0) {
        return [];
      }

      const filtered = filter ? unsortedQueries.filter(item => rankItem(item.queryHash, filter).passed) : [...unsortedQueries];
      const sorted = sortFn ? filtered.sort((a, b) => sortFn(a, b) * baseSort) : filtered;
      return sorted;
    }, [baseSort, sortFn, filter, queriesCount, queryCache]);
    const [isMockOffline, setMockOffline] = React__namespace.useState(false);
    return /*#__PURE__*/React__namespace.createElement(ThemeProvider, {
      theme: defaultTheme
    }, /*#__PURE__*/React__namespace.createElement(Panel, _extends({
      ref: ref,
      className: "ReactQueryDevtoolsPanel",
      "aria-label": "React Query Devtools Panel",
      id: "ReactQueryDevtoolsPanel"
    }, panelProps, {
      style: {
        height: defaultPanelSize,
        position: 'relative',
        ...panelProps.style
      }
    }), /*#__PURE__*/React__namespace.createElement("style", {
      nonce: styleNonce,
      dangerouslySetInnerHTML: {
        __html: "\n            .ReactQueryDevtoolsPanel * {\n              scrollbar-color: " + defaultTheme.backgroundAlt + " " + defaultTheme.gray + ";\n            }\n\n            .ReactQueryDevtoolsPanel *::-webkit-scrollbar, .ReactQueryDevtoolsPanel scrollbar {\n              width: 1em;\n              height: 1em;\n            }\n\n            .ReactQueryDevtoolsPanel *::-webkit-scrollbar-track, .ReactQueryDevtoolsPanel scrollbar-track {\n              background: " + defaultTheme.backgroundAlt + ";\n            }\n\n            .ReactQueryDevtoolsPanel *::-webkit-scrollbar-thumb, .ReactQueryDevtoolsPanel scrollbar-thumb {\n              background: " + defaultTheme.gray + ";\n              border-radius: .5em;\n              border: 3px solid " + defaultTheme.backgroundAlt + ";\n            }\n          "
      }
    }), /*#__PURE__*/React__namespace.createElement("div", {
      style: getResizeHandleStyle(position),
      onMouseDown: onDragStart
    }), isOpen && /*#__PURE__*/React__namespace.createElement("div", {
      style: {
        flex: '1 1 500px',
        minHeight: '40%',
        maxHeight: '100%',
        overflow: 'auto',
        borderRight: "1px solid " + defaultTheme.grayAlt,
        display: 'flex',
        flexDirection: 'column'
      }
    }, /*#__PURE__*/React__namespace.createElement("div", {
      style: {
        padding: '.5em',
        background: defaultTheme.backgroundAlt,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }
    }, /*#__PURE__*/React__namespace.createElement("button", {
      type: "button",
      "aria-label": "Close React Query Devtools",
      "aria-controls": "ReactQueryDevtoolsPanel",
      "aria-haspopup": "true",
      "aria-expanded": "true",
      onClick: () => setIsOpen(false),
      style: {
        display: 'inline-flex',
        background: 'none',
        border: 0,
        padding: 0,
        marginRight: '.5em',
        cursor: 'pointer'
      }
    }, /*#__PURE__*/React__namespace.createElement(Logo, {
      "aria-hidden": true
    }), /*#__PURE__*/React__namespace.createElement(ScreenReader, {
      text: "Close React Query Devtools"
    })), /*#__PURE__*/React__namespace.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column'
      }
    }, /*#__PURE__*/React__namespace.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '.5em'
      }
    }, /*#__PURE__*/React__namespace.createElement(QueryStatusCount, {
      queryCache: queryCache
    }), position && onPositionChange ? /*#__PURE__*/React__namespace.createElement(Select, {
      "aria-label": "Panel position",
      value: position,
      style: {
        marginInlineStart: '.5em'
      },
      onChange: e => onPositionChange(e.target.value)
    }, /*#__PURE__*/React__namespace.createElement("option", {
      value: "left"
    }, "Left"), /*#__PURE__*/React__namespace.createElement("option", {
      value: "right"
    }, "Right"), /*#__PURE__*/React__namespace.createElement("option", {
      value: "top"
    }, "Top"), /*#__PURE__*/React__namespace.createElement("option", {
      value: "bottom"
    }, "Bottom")) : null), /*#__PURE__*/React__namespace.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.5em'
      }
    }, /*#__PURE__*/React__namespace.createElement(Input, {
      placeholder: "Filter",
      "aria-label": "Filter by queryhash",
      value: filter != null ? filter : '',
      onChange: e => setFilter(e.target.value),
      onKeyDown: e => {
        if (e.key === 'Escape') setFilter('');
      },
      style: {
        flex: '1',
        width: '100%'
      }
    }), /*#__PURE__*/React__namespace.createElement(Select, {
      "aria-label": "Sort queries",
      value: sort,
      onChange: e => setSort(e.target.value),
      style: {
        flex: '1',
        minWidth: 75,
        marginRight: '.5em'
      }
    }, Object.keys(sortFns).map(key => /*#__PURE__*/React__namespace.createElement("option", {
      key: key,
      value: key
    }, "Sort by ", key))), /*#__PURE__*/React__namespace.createElement(Button, {
      type: "button",
      onClick: () => setBaseSort(old => old * -1),
      style: {
        padding: '.3em .4em',
        marginRight: '.5em'
      }
    }, baseSort === 1 ? '⬆ Asc' : '⬇ Desc'), /*#__PURE__*/React__namespace.createElement(Button, {
      title: "Clear cache",
      "aria-label": "Clear cache",
      type: "button",
      onClick: () => queryCache.clear(),
      style: {
        padding: '.3em .4em',
        marginRight: '.5em'
      }
    }, "Clear"), /*#__PURE__*/React__namespace.createElement(Button, {
      type: "button",
      onClick: () => {
        if (isMockOffline) {
          reactQuery.onlineManager.setOnline(undefined);
          setMockOffline(false);
          window.dispatchEvent(new Event('online'));
        } else {
          reactQuery.onlineManager.setOnline(false);
          setMockOffline(true);
        }
      },
      "aria-label": isMockOffline ? 'Restore offline mock' : 'Mock offline behavior',
      title: isMockOffline ? 'Restore offline mock' : 'Mock offline behavior',
      style: {
        padding: '0',
        height: '2em'
      }
    }, /*#__PURE__*/React__namespace.createElement("svg", {
      xmlns: "http://www.w3.org/2000/svg",
      width: "2em",
      height: "2em",
      viewBox: "0 0 24 24",
      stroke: isMockOffline ? defaultTheme.danger : 'currentColor',
      fill: "none"
    }, isMockOffline ? /*#__PURE__*/React__namespace.createElement(React__namespace.Fragment, null, /*#__PURE__*/React__namespace.createElement("path", {
      stroke: "none",
      d: "M0 0h24v24H0z",
      fill: "none"
    }), /*#__PURE__*/React__namespace.createElement("line", {
      x1: "12",
      y1: "18",
      x2: "12.01",
      y2: "18"
    }), /*#__PURE__*/React__namespace.createElement("path", {
      d: "M9.172 15.172a4 4 0 0 1 5.656 0"
    }), /*#__PURE__*/React__namespace.createElement("path", {
      d: "M6.343 12.343a7.963 7.963 0 0 1 3.864 -2.14m4.163 .155a7.965 7.965 0 0 1 3.287 2"
    }), /*#__PURE__*/React__namespace.createElement("path", {
      d: "M3.515 9.515a12 12 0 0 1 3.544 -2.455m3.101 -.92a12 12 0 0 1 10.325 3.374"
    }), /*#__PURE__*/React__namespace.createElement("line", {
      x1: "3",
      y1: "3",
      x2: "21",
      y2: "21"
    })) : /*#__PURE__*/React__namespace.createElement(React__namespace.Fragment, null, /*#__PURE__*/React__namespace.createElement("path", {
      stroke: "none",
      d: "M0 0h24v24H0z",
      fill: "none"
    }), /*#__PURE__*/React__namespace.createElement("line", {
      x1: "12",
      y1: "18",
      x2: "12.01",
      y2: "18"
    }), /*#__PURE__*/React__namespace.createElement("path", {
      d: "M9.172 15.172a4 4 0 0 1 5.656 0"
    }), /*#__PURE__*/React__namespace.createElement("path", {
      d: "M6.343 12.343a8 8 0 0 1 11.314 0"
    }), /*#__PURE__*/React__namespace.createElement("path", {
      d: "M3.515 9.515c4.686 -4.687 12.284 -4.687 17 0"
    }))), /*#__PURE__*/React__namespace.createElement(ScreenReader, {
      text: isMockOffline ? 'Restore offline mock' : 'Mock offline behavior'
    }))))), /*#__PURE__*/React__namespace.createElement("div", {
      style: {
        overflowY: 'auto',
        flex: '1'
      }
    }, queries.map(query => {
      return /*#__PURE__*/React__namespace.createElement(QueryRow, {
        queryKey: query.queryKey,
        activeQueryHash: activeQueryHash,
        setActiveQueryHash: setActiveQueryHash,
        key: query.queryHash,
        queryCache: queryCache
      });
    }))), activeQueryHash && isOpen ? /*#__PURE__*/React__namespace.createElement(ActiveQuery, {
      activeQueryHash: activeQueryHash,
      queryCache: queryCache,
      queryClient: queryClient,
      errorTypes: errorTypes
    }) : null, showCloseButton ? /*#__PURE__*/React__namespace.createElement(Button, _extends({
      type: "button",
      "aria-controls": "ReactQueryDevtoolsPanel",
      "aria-haspopup": "true",
      "aria-expanded": "true"
    }, otherCloseButtonProps, {
      style: {
        position: 'absolute',
        zIndex: 99999,
        margin: '.5em',
        bottom: 0,
        left: 0,
        ...otherCloseButtonProps.style
      },
      onClick: e => {
        setIsOpen(false);
        onCloseClick == null ? void 0 : onCloseClick(e);
      }
    }), "Close") : null));
  });

  const ActiveQuery = ({
    queryCache,
    activeQueryHash,
    queryClient,
    errorTypes
  }) => {
    var _useSubscribeToQueryC, _useSubscribeToQueryC2;

    const activeQuery = useSubscribeToQueryCache(queryCache, () => queryCache.getAll().find(query => query.queryHash === activeQueryHash));
    const activeQueryState = useSubscribeToQueryCache(queryCache, () => {
      var _queryCache$getAll$fi;

      return (_queryCache$getAll$fi = queryCache.getAll().find(query => query.queryHash === activeQueryHash)) == null ? void 0 : _queryCache$getAll$fi.state;
    });
    const isStale = (_useSubscribeToQueryC = useSubscribeToQueryCache(queryCache, () => {
      var _queryCache$getAll$fi2;

      return (_queryCache$getAll$fi2 = queryCache.getAll().find(query => query.queryHash === activeQueryHash)) == null ? void 0 : _queryCache$getAll$fi2.isStale();
    })) != null ? _useSubscribeToQueryC : false;
    const observerCount = (_useSubscribeToQueryC2 = useSubscribeToQueryCache(queryCache, () => {
      var _queryCache$getAll$fi3;

      return (_queryCache$getAll$fi3 = queryCache.getAll().find(query => query.queryHash === activeQueryHash)) == null ? void 0 : _queryCache$getAll$fi3.getObserversCount();
    })) != null ? _useSubscribeToQueryC2 : 0;

    const handleRefetch = () => {
      const promise = activeQuery == null ? void 0 : activeQuery.fetch();
      promise == null ? void 0 : promise.catch(noop);
    };

    const currentErrorTypeName = React.useMemo(() => {
      if (activeQuery && activeQueryState != null && activeQueryState.error) {
        const errorType = errorTypes.find(type => {
          var _activeQueryState$err;

          return type.initializer(activeQuery).toString() === ((_activeQueryState$err = activeQueryState.error) == null ? void 0 : _activeQueryState$err.toString());
        });
        return errorType == null ? void 0 : errorType.name;
      }

      return undefined;
    }, [activeQuery, activeQueryState == null ? void 0 : activeQueryState.error, errorTypes]);

    if (!activeQuery || !activeQueryState) {
      return null;
    }

    const triggerError = errorType => {
      var _errorType$initialize;

      const error = (_errorType$initialize = errorType == null ? void 0 : errorType.initializer(activeQuery)) != null ? _errorType$initialize : new Error('Unknown error from devtools');
      const __previousQueryOptions = activeQuery.options;
      activeQuery.setState({
        status: 'error',
        error,
        fetchMeta: { ...activeQuery.state.fetchMeta,
          __previousQueryOptions
        }
      });
    };

    const restoreQueryAfterLoadingOrError = () => {
      activeQuery.fetch(activeQuery.state.fetchMeta.__previousQueryOptions, {
        // Make sure this fetch will cancel the previous one
        cancelRefetch: true
      });
    };

    return /*#__PURE__*/React__namespace.createElement(ActiveQueryPanel, null, /*#__PURE__*/React__namespace.createElement("div", {
      style: {
        padding: '.5em',
        background: defaultTheme.backgroundAlt,
        position: 'sticky',
        top: 0,
        zIndex: 1
      }
    }, "Query Details"), /*#__PURE__*/React__namespace.createElement("div", {
      style: {
        padding: '.5em'
      }
    }, /*#__PURE__*/React__namespace.createElement("div", {
      style: {
        marginBottom: '.5em',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between'
      }
    }, /*#__PURE__*/React__namespace.createElement(Code, {
      style: {
        lineHeight: '1.8em'
      }
    }, /*#__PURE__*/React__namespace.createElement("pre", {
      style: {
        margin: 0,
        padding: 0,
        overflow: 'auto'
      }
    }, displayValue(activeQuery.queryKey, true))), /*#__PURE__*/React__namespace.createElement("span", {
      style: {
        padding: '0.3em .6em',
        borderRadius: '0.4em',
        fontWeight: 'bold',
        textShadow: '0 2px 10px black',
        background: getQueryStatusColor({
          queryState: activeQueryState,
          isStale: isStale,
          observerCount: observerCount,
          theme: defaultTheme
        }),
        flexShrink: 0
      }
    }, getQueryStatusLabel(activeQuery))), /*#__PURE__*/React__namespace.createElement("div", {
      style: {
        marginBottom: '.5em',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }
    }, "Observers: ", /*#__PURE__*/React__namespace.createElement(Code, null, observerCount)), /*#__PURE__*/React__namespace.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }
    }, "Last Updated:", ' ', /*#__PURE__*/React__namespace.createElement(Code, null, new Date(activeQueryState.dataUpdatedAt).toLocaleTimeString()))), /*#__PURE__*/React__namespace.createElement("div", {
      style: {
        background: defaultTheme.backgroundAlt,
        padding: '.5em',
        position: 'sticky',
        top: 0,
        zIndex: 1
      }
    }, "Actions"), /*#__PURE__*/React__namespace.createElement("div", {
      style: {
        padding: '0.5em',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.5em',
        alignItems: 'flex-end'
      }
    }, /*#__PURE__*/React__namespace.createElement(Button, {
      type: "button",
      onClick: handleRefetch,
      disabled: activeQueryState.fetchStatus === 'fetching',
      style: {
        background: defaultTheme.active
      }
    }, "Refetch"), ' ', /*#__PURE__*/React__namespace.createElement(Button, {
      type: "button",
      onClick: () => queryClient.invalidateQueries(activeQuery),
      style: {
        background: defaultTheme.warning,
        color: defaultTheme.inputTextColor
      }
    }, "Invalidate"), ' ', /*#__PURE__*/React__namespace.createElement(Button, {
      type: "button",
      onClick: () => queryClient.resetQueries(activeQuery),
      style: {
        background: defaultTheme.gray
      }
    }, "Reset"), ' ', /*#__PURE__*/React__namespace.createElement(Button, {
      type: "button",
      onClick: () => queryClient.removeQueries(activeQuery),
      style: {
        background: defaultTheme.danger
      }
    }, "Remove"), ' ', /*#__PURE__*/React__namespace.createElement(Button, {
      type: "button",
      onClick: () => {
        var _activeQuery$state$fe;

        // Return early if the query is already restoring
        if (activeQuery.state.fetchStatus === 'fetching' && typeof ((_activeQuery$state$fe = activeQuery.state.fetchMeta) == null ? void 0 : _activeQuery$state$fe.__previousQueryOptions) === 'undefined') {
          return;
        }

        if (activeQuery.state.data === undefined) {
          restoreQueryAfterLoadingOrError();
        } else {
          const __previousQueryOptions = activeQuery.options; // Trigger a fetch in order to trigger suspense as well.

          activeQuery.fetch({ ...__previousQueryOptions,
            queryFn: () => {
              return new Promise(() => {// Never resolve
              });
            },
            cacheTime: -1
          });
          activeQuery.setState({
            data: undefined,
            status: 'loading',
            fetchMeta: { ...activeQuery.state.fetchMeta,
              __previousQueryOptions
            }
          });
        }
      },
      style: {
        background: defaultTheme.paused
      }
    }, activeQuery.state.status === 'loading' ? 'Restore' : 'Trigger', ' ', "loading"), ' ', errorTypes.length === 0 || activeQuery.state.status === 'error' ? /*#__PURE__*/React__namespace.createElement(Button, {
      type: "button",
      onClick: () => {
        if (!activeQuery.state.error) {
          triggerError();
        } else {
          queryClient.resetQueries(activeQuery);
        }
      },
      style: {
        background: defaultTheme.danger
      }
    }, activeQuery.state.status === 'error' ? 'Restore' : 'Trigger', " error") : /*#__PURE__*/React__namespace.createElement("label", null, "Trigger error:", /*#__PURE__*/React__namespace.createElement(Select, {
      value: currentErrorTypeName != null ? currentErrorTypeName : '',
      style: {
        marginInlineStart: '.5em'
      },
      onChange: e => {
        const errorType = errorTypes.find(t => t.name === e.target.value);
        triggerError(errorType);
      }
    }, /*#__PURE__*/React__namespace.createElement("option", {
      key: "",
      value: ""
    }), errorTypes.map(errorType => /*#__PURE__*/React__namespace.createElement("option", {
      key: errorType.name,
      value: errorType.name
    }, errorType.name))))), /*#__PURE__*/React__namespace.createElement("div", {
      style: {
        background: defaultTheme.backgroundAlt,
        padding: '.5em',
        position: 'sticky',
        top: 0,
        zIndex: 1
      }
    }, "Data Explorer"), /*#__PURE__*/React__namespace.createElement("div", {
      style: {
        padding: '.5em'
      }
    }, /*#__PURE__*/React__namespace.createElement(Explorer, {
      label: "Data",
      value: activeQueryState.data,
      defaultExpanded: {},
      copyable: true
    })), /*#__PURE__*/React__namespace.createElement("div", {
      style: {
        background: defaultTheme.backgroundAlt,
        padding: '.5em',
        position: 'sticky',
        top: 0,
        zIndex: 1
      }
    }, "Query Explorer"), /*#__PURE__*/React__namespace.createElement("div", {
      style: {
        padding: '.5em'
      }
    }, /*#__PURE__*/React__namespace.createElement(Explorer, {
      label: "Query",
      value: activeQuery,
      defaultExpanded: {
        queryKey: true
      }
    })));
  };

  const QueryStatusCount = ({
    queryCache
  }) => {
    const hasFresh = useSubscribeToQueryCache(queryCache, () => queryCache.getAll().filter(q => getQueryStatusLabel(q) === 'fresh').length);
    const hasFetching = useSubscribeToQueryCache(queryCache, () => queryCache.getAll().filter(q => getQueryStatusLabel(q) === 'fetching').length);
    const hasPaused = useSubscribeToQueryCache(queryCache, () => queryCache.getAll().filter(q => getQueryStatusLabel(q) === 'paused').length);
    const hasStale = useSubscribeToQueryCache(queryCache, () => queryCache.getAll().filter(q => getQueryStatusLabel(q) === 'stale').length);
    const hasInactive = useSubscribeToQueryCache(queryCache, () => queryCache.getAll().filter(q => getQueryStatusLabel(q) === 'inactive').length);
    return /*#__PURE__*/React__namespace.createElement(QueryKeys, null, /*#__PURE__*/React__namespace.createElement(QueryKey, {
      style: {
        background: defaultTheme.success,
        opacity: hasFresh ? 1 : 0.3
      }
    }, "fresh ", /*#__PURE__*/React__namespace.createElement(Code, null, "(", hasFresh, ")")), ' ', /*#__PURE__*/React__namespace.createElement(QueryKey, {
      style: {
        background: defaultTheme.active,
        opacity: hasFetching ? 1 : 0.3
      }
    }, "fetching ", /*#__PURE__*/React__namespace.createElement(Code, null, "(", hasFetching, ")")), ' ', /*#__PURE__*/React__namespace.createElement(QueryKey, {
      style: {
        background: defaultTheme.paused,
        opacity: hasPaused ? 1 : 0.3
      }
    }, "paused ", /*#__PURE__*/React__namespace.createElement(Code, null, "(", hasPaused, ")")), ' ', /*#__PURE__*/React__namespace.createElement(QueryKey, {
      style: {
        background: defaultTheme.warning,
        color: 'black',
        textShadow: '0',
        opacity: hasStale ? 1 : 0.3
      }
    }, "stale ", /*#__PURE__*/React__namespace.createElement(Code, null, "(", hasStale, ")")), ' ', /*#__PURE__*/React__namespace.createElement(QueryKey, {
      style: {
        background: defaultTheme.gray,
        opacity: hasInactive ? 1 : 0.3
      }
    }, "inactive ", /*#__PURE__*/React__namespace.createElement(Code, null, "(", hasInactive, ")")));
  };

  const QueryRow = /*#__PURE__*/React__namespace.memo(({
    queryKey,
    setActiveQueryHash,
    activeQueryHash,
    queryCache
  }) => {
    var _useSubscribeToQueryC3, _useSubscribeToQueryC4, _useSubscribeToQueryC5, _useSubscribeToQueryC6;

    const queryHash = (_useSubscribeToQueryC3 = useSubscribeToQueryCache(queryCache, () => {
      var _queryCache$find;

      return (_queryCache$find = queryCache.find(queryKey)) == null ? void 0 : _queryCache$find.queryHash;
    })) != null ? _useSubscribeToQueryC3 : '';
    const queryState = useSubscribeToQueryCache(queryCache, () => {
      var _queryCache$find2;

      return (_queryCache$find2 = queryCache.find(queryKey)) == null ? void 0 : _queryCache$find2.state;
    });
    const isStale = (_useSubscribeToQueryC4 = useSubscribeToQueryCache(queryCache, () => {
      var _queryCache$find3;

      return (_queryCache$find3 = queryCache.find(queryKey)) == null ? void 0 : _queryCache$find3.isStale();
    })) != null ? _useSubscribeToQueryC4 : false;
    const isDisabled = (_useSubscribeToQueryC5 = useSubscribeToQueryCache(queryCache, () => {
      var _queryCache$find4;

      return (_queryCache$find4 = queryCache.find(queryKey)) == null ? void 0 : _queryCache$find4.isDisabled();
    })) != null ? _useSubscribeToQueryC5 : false;
    const observerCount = (_useSubscribeToQueryC6 = useSubscribeToQueryCache(queryCache, () => {
      var _queryCache$find5;

      return (_queryCache$find5 = queryCache.find(queryKey)) == null ? void 0 : _queryCache$find5.getObserversCount();
    })) != null ? _useSubscribeToQueryC6 : 0;

    if (!queryState) {
      return null;
    }

    return /*#__PURE__*/React__namespace.createElement("div", {
      role: "button",
      "aria-label": "Open query details for " + queryHash,
      onClick: () => setActiveQueryHash(activeQueryHash === queryHash ? '' : queryHash),
      style: {
        display: 'flex',
        borderBottom: "solid 1px " + defaultTheme.grayAlt,
        cursor: 'pointer',
        background: queryHash === activeQueryHash ? 'rgba(255,255,255,.1)' : undefined
      }
    }, /*#__PURE__*/React__namespace.createElement("div", {
      style: {
        flex: '0 0 auto',
        width: '2em',
        height: '2em',
        background: getQueryStatusColor({
          queryState,
          isStale,
          observerCount,
          theme: defaultTheme
        }),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 'bold',
        textShadow: isStale ? '0' : '0 0 10px black',
        color: isStale ? 'black' : 'white'
      }
    }, observerCount), isDisabled ? /*#__PURE__*/React__namespace.createElement("div", {
      style: {
        flex: '0 0 auto',
        height: '2em',
        background: defaultTheme.gray,
        display: 'flex',
        alignItems: 'center',
        fontWeight: 'bold',
        padding: '0 0.5em'
      }
    }, "disabled") : null, /*#__PURE__*/React__namespace.createElement(Code, {
      style: {
        padding: '.5em'
      }
    }, "" + queryHash));
  });
  QueryRow.displayName = 'QueryRow'; // eslint-disable-next-line @typescript-eslint/no-empty-function

  function noop() {}

  const ReactQueryDevtools = ReactQueryDevtools$1;
  const ReactQueryDevtoolsPanel = ReactQueryDevtoolsPanel$1;

  exports.ReactQueryDevtools = ReactQueryDevtools;
  exports.ReactQueryDevtoolsPanel = ReactQueryDevtoolsPanel;

  Object.defineProperty(exports, '__esModule', { value: true });

}));
//# sourceMappingURL=index.development.js.map
