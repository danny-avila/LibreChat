'use strict';

module.exports = {
  name:     'resize',
  fn:       require('./resize'),
  wasm_fn:  require('./resize_wasm'),
  wasm_src: require('./convolve_wasm_base64')
};
