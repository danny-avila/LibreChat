const fs = require('fs');
const path = require('path');

/**
 * Guards the property the rest of the search tests cannot: that the composition
 * root has a production caller, in every entry point, and that no entry point
 * has grown a second way to assemble the stack.
 *
 * Seven separate components of this feature shipped fully tested and completely
 * unreachable, all by the same mechanism — the test harness was the only place
 * that built the whole thing. An end-to-end test fixes that for the parts it
 * exercises, but it calls `initializeChatSearch()` itself, so it would still
 * pass if someone deleted that call from `server/index.js`. This closes that
 * last gap, cheaply, by reading the entry points.
 */
const SERVER_DIR = path.join(__dirname, '..');

const ENTRY_POINTS = ['index.js', 'experimental.js'];

/** The parts that must only ever be assembled inside the composition root. */
const ASSEMBLY_PRIMITIVES = ['new Projector(', 'createChatSearch(', 'createSearchPool('];

function readEntry(filename) {
  return fs.readFileSync(path.join(SERVER_DIR, filename), 'utf8');
}

describe('chat search composition root', () => {
  describe.each(ENTRY_POINTS)('%s', (filename) => {
    const source = readEntry(filename);

    it('installs chat search through the composition root', () => {
      expect(source).toContain("require('./services/Search')");
      expect(source).toContain('initializeChatSearch(');
    });

    /**
     * Both entries mount the same search routes. An entry that serves them
     * without installing a backend answers every search with an empty result and
     * reports itself healthy while doing it.
     */
    it('does not assemble the stack by hand', () => {
      for (const primitive of ASSEMBLY_PRIMITIVES) {
        expect(source).not.toContain(primitive);
      }
    });
  });

  it('exposes exactly one place that builds the stack', () => {
    const service = fs.readFileSync(
      path.join(SERVER_DIR, 'services', 'Search', 'index.js'),
      'utf8',
    );
    expect(service).toContain('startChatSearch');
  });
});
