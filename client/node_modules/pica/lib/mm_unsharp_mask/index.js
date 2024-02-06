'use strict';

module.exports = {
  name:     'unsharp_mask',
  fn:       require('./unsharp_mask'),
  wasm_fn:  require('./unsharp_mask_wasm'),
  wasm_src: require('./unsharp_mask_wasm_base64')
};
