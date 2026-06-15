const path = require('path');
const { loadAndFormatTools } = require('~/server/services/start/tools');

describe('get_location tool registration', () => {
  it('is discovered by loadAndFormatTools so it shows in the picker and survives agent save', () => {
    const directory = path.resolve(__dirname, '..');
    const tools = loadAndFormatTools({ directory, adminFilter: [], adminIncluded: [] });
    expect(tools.get_location).toBeDefined();
    expect(tools.get_location.function.name).toBe('get_location');
  });
});
