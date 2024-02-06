"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.styleHookSingleton = exports.stylesheetSingleton = exports.styleSingleton = void 0;
var component_1 = require("./component");
Object.defineProperty(exports, "styleSingleton", { enumerable: true, get: function () { return component_1.styleSingleton; } });
var singleton_1 = require("./singleton");
Object.defineProperty(exports, "stylesheetSingleton", { enumerable: true, get: function () { return singleton_1.stylesheetSingleton; } });
var hook_1 = require("./hook");
Object.defineProperty(exports, "styleHookSingleton", { enumerable: true, get: function () { return hook_1.styleHookSingleton; } });
