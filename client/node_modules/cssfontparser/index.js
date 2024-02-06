// Inspriation from node-canvas (https://github.com/LearnBoost/node-canvas/)

var cache = {};

// regex hoisted from http://stackoverflow.com/questions/10135697/regex-to-parse-any-css-font
var fontRegex = new RegExp([
  '^\\s*(?=(?:(?:[-a-z]+\\s*){0,2}(italic|oblique))?)',
  '(?=(?:(?:[-a-z]+\\s*){0,2}(small-caps))?)',
  '(?=(?:(?:[-a-z]+\\s*){0,2}(bold(?:er)?|lighter|[1-9]00 ))?)',
  '(?:(?:normal|\\1|\\2|\\3)\\s*){0,3}((?:xx?-)?',
  '(?:small|large)|medium|smaller|larger|[\\.\\d]+(?:\\%|in|[cem]m|ex|p[ctx]))',
  '(?:\\s*\\/\\s*(normal|[\\.\\d]+(?:\\%|in|[cem]m|ex|p[ctx])?))',
  '?\\s*([-,\\"\\\'\\sa-z]+?)\\s*$'
].join(''), 'i');


var mapping = [
  'style',
  'variant',
  'weight',
  'size',
  'lineHeight',
  'family'
];

var unitMatch = /([\.0-9]+)(.*)/;

var numeric = function(val, parent, dpi) {

  var matches = val.match(unitMatch);

  if (!matches) {
    return;
  }

  val = parseFloat(matches[1]);
  var units = matches[2].toLowerCase().trim();

  var v = Math.round(val);
  if (v === val) {
    val = v;
  }

  switch (units) {
    case 'em':
      if (parent === null) {
        return;
      }

      return val * parent;
    break;

    case 'px':
      return val;
    break;

    case 'pt':
      return val / (72/dpi);
    break;

    case 'pc':
      return val / (6/dpi);
    break;

    case 'mm':
      return val * (dpi/25.4)
    break;

    case 'cm':
      return val * (dpi/2.54)
    break;

    case 'in':
      return val * dpi;
    break;

    case '%':
      if (parent === null) {
        return;
      }
      return parent * (val/100);
    break;

  }
};

var op = {
  size: numeric,
  lineHeight: numeric
};

var generics = {
  serif : 1,
  'sans-serif': 1,
  cursive: 1,
  fantasy: 1,
  monospace: 1
};

var parse = module.exports = function(str, existing, dpi) {
  var cacheKey = str + '-' + (existing || 'null') +'@' + dpi;

  dpi = dpi || 96.0;

  if (typeof cache[cacheKey] !== 'undefined') {
    return cache[cacheKey];
  }

  if (existing) {
    existing = parse(existing, null, dpi);
  }

  if (str === 'inherit') {
    return existing;
  }

  var matches = fontRegex.exec(str);

  if (!matches) {
    cache[cacheKey] = null;
    return;
  }

  matches.shift();

  var collected = {};
  for (var i=0; i<matches.length; i++) {
    var key = mapping[i];
    var val = matches[i];

    if (op[key] && val) {
      var existingVal = (existing) ? existing[key] || null : null;
      var v = op[key](val, existingVal, dpi);
      if (typeof v === 'undefined' && key === 'lineHeight' && val) {
        val = collected.size * parseFloat(val);
      } else {
        val = v;
      }
    }


    if (!val || val === 'normal') {
      continue;
    } else if (val === 'inherit') {

      if (!existing) {
        return;
      }

      val = existing[key];
    }

    if (val.trim) {
      val = val.trim();
    }

    collected[key] = val;
  }

  if (!Object.keys(collected).length) {
    collected = null;
  }

  cache[cacheKey] = collected;

  var out = [];
  if (collected.style) {
    out.push(collected.style);
  }

  if (collected.variant) {
    out.push(collected.variant);
  }

  if (collected.weight &&
      collected.weight !== '400' &&
      collected.weight !== 'normal')
  {
    out.push(collected.weight);
  }

  out.push(collected.size + 'px');

  if (collected.lineHeight) {
    out[out.length-1] += '/' + collected.lineHeight + 'px';
  }

  var family = collected.family.split(',');
  collected.family = family.map(function(a) {
    a = a.trim();

    if (generics[a.toLowerCase()]) {
      a = a.toLowerCase();
    }

    return a;
  });

  out.push(collected.family);


  Object.defineProperty(collected, 'toString', {
    value: function() {
      return out.map(function(val) {
        if (Array.isArray(val)) {
          return val.map(function(a) {
            if (a.indexOf(' ') > -1) {
              return '"' + a.replace(/["']/g, '') + '"';
            } else {
              return a;
            }
          }).join(', ');
        } else {
          return val;
        }
      }).join(' ');
    }
  });

  return collected;
};

module.exports.generics = generics;
