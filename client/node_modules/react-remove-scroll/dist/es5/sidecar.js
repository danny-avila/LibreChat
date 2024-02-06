"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var use_sidecar_1 = require("use-sidecar");
var SideEffect_1 = require("./SideEffect");
var medium_1 = require("./medium");
exports.default = (0, use_sidecar_1.exportSidecar)(medium_1.effectCar, SideEffect_1.RemoveScrollSideCar);
