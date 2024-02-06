"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
var _iconsManifest = require("./iconsManifest");
Object.keys(_iconsManifest).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (key in exports && exports[key] === _iconsManifest[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function get() {
      return _iconsManifest[key];
    }
  });
});
var _iconBase = require("./iconBase");
Object.keys(_iconBase).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (key in exports && exports[key] === _iconBase[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function get() {
      return _iconBase[key];
    }
  });
});
var _iconContext = require("./iconContext");
Object.keys(_iconContext).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (key in exports && exports[key] === _iconContext[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function get() {
      return _iconContext[key];
    }
  });
});