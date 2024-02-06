"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
var detect_node_es_1 = require("detect-node-es");
exports.env = {
    isNode: detect_node_es_1.isNode,
    forceCache: false,
};
