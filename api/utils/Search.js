const { MeiliSearch } = require('meilisearch');

class Search {
  constructor() {
    this.client = new MeiliSearch({
      host: process.env.MEILI_HOST,
      apiKey: process.env.MEILI_MASTER_KEY,
    });
  }

  /**
   * Find or create an index
   *
   * @param name
   * @param createFunction
   * @returns {Promise<Index<Record<string, any>>>}
   */
  async findOrCreateIndex(name, createFunction) {
    const index = await this.client.index(name);
    if (index) {
      return index;
    }
    await this.client.createIndex(name);
    const created = await this.client.index(name);
    // If the index was not created, throw an error
    if (!created) {
      throw new Error('Unable to create index');
    }
    // If a createFunction is passed, call it
    if (typeof createFunction === 'function') {
      createFunction(created);
    }
    return created;
  }

  /**
   * Get the search key for the index
   * Restricted to the actions passed
   *
   * @param index
   * @returns {Promise<string>}
   */
  async getSearchKey(index) {
    // Todo: caching keys
    const response = await this.client.createKey({
      description: 'Search for index: ' + index,
      actions: ['documents.search'],
      indexes: [index],
      // Expires in 24 hours
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    return response.key;
  }
}

const search = new Search();

export default search;
