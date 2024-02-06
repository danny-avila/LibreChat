// Filter definitions to build tables for
// resizing convolvers.
//
// Presets for quality 0..3. Filter functions + window size
//
'use strict';


const filter = {
  // Nearest neibor
  box: {
    win: 0.5,
    fn: function (x) {
      if (x < 0) x = -x;
      return (x < 0.5) ? 1.0 : 0.0;
    }
  },
  // // Hamming
  hamming: {
    win: 1.0,
    fn: function (x) {
      if (x < 0) x = -x;
      if (x >= 1.0) { return 0.0; }
      if (x < 1.19209290E-07) { return 1.0; }
      var xpi = x * Math.PI;
      return ((Math.sin(xpi) / xpi) *  (0.54 + 0.46 * Math.cos(xpi / 1.0)));
    }
  },
  // Lanczos, win = 2
  lanczos2: {
    win: 2.0,
    fn: function (x) {
      if (x < 0) x = -x;
      if (x >= 2.0) { return 0.0; }
      if (x < 1.19209290E-07) { return 1.0; }
      var xpi = x * Math.PI;
      return (Math.sin(xpi) / xpi) * Math.sin(xpi / 2.0) / (xpi / 2.0);
    }
  },
  // Lanczos, win = 3
  lanczos3: {
    win: 3.0,
    fn: function (x) {
      if (x < 0) x = -x;
      if (x >= 3.0) { return 0.0; }
      if (x < 1.19209290E-07) { return 1.0; }
      var xpi = x * Math.PI;
      return (Math.sin(xpi) / xpi) * Math.sin(xpi / 3.0) / (xpi / 3.0);
    }
  },
  // Magic Kernel Sharp 2013, win = 2.5
  // http://johncostella.com/magic/
  mks2013: {
    win: 2.5,
    fn: function (x) {
      if (x < 0) x = -x;
      if (x >= 2.5) { return 0.0; }
      if (x >= 1.5) { return -0.125 * (x - 2.5) * (x - 2.5); }
      if (x >= 0.5) { return 0.25 * (4 * x * x - 11 * x + 7); }
      return 1.0625 - 1.75 * x * x;
    }
  }
};

module.exports = {
  filter: filter,
  // Legacy mapping
  f2q: { box: 0, hamming: 1, lanczos2: 2, lanczos3: 3 },
  q2f: [ 'box', 'hamming', 'lanczos2', 'lanczos3' ]
};
