'use strict';

if (process.env.NODE_ENV === "production") {
  module.exports = require("./use-latest.cjs.prod.js");
} else {
  module.exports = require("./use-latest.cjs.dev.js");
}
