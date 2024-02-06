'use strict';

if (process.env.NODE_ENV === "production") {
  module.exports = require("./use-isomorphic-layout-effect.cjs.prod.js");
} else {
  module.exports = require("./use-isomorphic-layout-effect.cjs.dev.js");
}
