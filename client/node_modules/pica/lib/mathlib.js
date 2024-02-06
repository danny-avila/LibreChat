// Collection of math functions
//
// 1. Combine components together
// 2. Has async init to load wasm modules
//
'use strict';


const Multimath = require('multimath');

const mm_unsharp_mask = require('./mm_unsharp_mask');
const mm_resize       = require('./mm_resize');


function MathLib(requested_features) {
  const __requested_features = requested_features || [];

  let features = {
    js:   __requested_features.indexOf('js') >= 0,
    wasm: __requested_features.indexOf('wasm') >= 0
  };

  Multimath.call(this, features);

  this.features = {
    js:   features.js,
    wasm: features.wasm && this.has_wasm()
  };

  this.use(mm_unsharp_mask);
  this.use(mm_resize);
}


MathLib.prototype = Object.create(Multimath.prototype);
MathLib.prototype.constructor = MathLib;


MathLib.prototype.resizeAndUnsharp = function resizeAndUnsharp(options, cache) {
  let result = this.resize(options, cache);

  if (options.unsharpAmount) {
    this.unsharp_mask(
      result,
      options.toWidth,
      options.toHeight,
      options.unsharpAmount,
      options.unsharpRadius,
      options.unsharpThreshold
    );
  }

  return result;
};


module.exports = MathLib;
