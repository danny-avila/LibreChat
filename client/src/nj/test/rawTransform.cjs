module.exports = {
  /**
   * Exports raw file text as a JS string (for being able to handle ?raw markdown inputs)
   */
  process(sourceText) {
    return { code: `module.exports = ${JSON.stringify(sourceText)};` };
  },
};
