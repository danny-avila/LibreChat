const { TestEnvironment } = require('jest-environment-jsdom');

/** jsdom lacks structuredClone, which IndexedDB requires when persisting values. */
module.exports = class IndexedDbEnvironment extends TestEnvironment {
  constructor(...args) {
    super(...args);
    this.global.structuredClone = structuredClone;
  }
};
