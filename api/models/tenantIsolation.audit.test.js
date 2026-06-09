const fs = require('fs');
const path = require('path');

describe('api/models tenant isolation audit', () => {
  it('does not contain raw find() or findOne() calls that bypass createMethods', () => {
    const indexPath = path.join(__dirname, 'index.js');
    const content = fs.readFileSync(indexPath, 'utf8');

    expect(content).toContain('createMethods');
    expect(content).not.toMatch(/\.findOne\s*\(/);
    expect(content).not.toMatch(/\.find\s*\(/);
    expect(content).not.toMatch(/mongoose\.model/);
  });

  it('only exports methods produced by the data-schemas factory', () => {
    const models = require('./index');

    expect(typeof models.getConvosByCursor).toBe('function');
    expect(typeof models.getSharedMessages).toBe('function');
    expect(typeof models.seedDatabase).toBe('function');
  });
});
