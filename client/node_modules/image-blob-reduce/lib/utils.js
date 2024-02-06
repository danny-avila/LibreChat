'use strict';


module.exports.assign = function assign(to) {
  var from;

  for (var s = 1; s < arguments.length; s++) {
    from = Object(arguments[s]);

    for (var key in from) {
      if (Object.prototype.hasOwnProperty.call(from, key)) to[key] = from[key];
    }
  }

  return to;
};


function pick(from, props) {
  var to = {};

  props.forEach(function (key) {
    if (Object.prototype.hasOwnProperty.call(from, key)) to[key] = from[key];
  });

  return to;
}


function pick_pica_resize_options(from) {
  return pick(from, [
    'alpha',
    'unsharpAmount',
    'unsharpRadius',
    'unsharpThreshold',
    'cancelToken'
  ]);
}


module.exports.pick = pick;
module.exports.pick_pica_resize_options = pick_pica_resize_options;
