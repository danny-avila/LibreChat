import type * as t from '~/types';
import mongoMeili from '~/models/plugins/mongoMeili';
import mongoSearch from '~/models/plugins/mongoSearch';
import { detectSearchProvider } from '~/models/plugins/search';
import messageSchema from '~/schema/message';

/**
 * Creates or returns the Message model using the provided mongoose instance and schema.
 *
 * Supports multiple search backends via the search provider abstraction:
 * - MeiliSearch (default, backward compatible with existing MEILI_HOST/MEILI_MASTER_KEY)
 * - OpenSearch (via SEARCH_PROVIDER=opensearch or OPENSEARCH_HOST)
 * - Typesense (via SEARCH_PROVIDER=typesense or TYPESENSE_HOST + TYPESENSE_API_KEY)
 */
export function createMessageModel(mongoose: typeof import('mongoose')) {
  const provider = detectSearchProvider();

  if (provider === 'meilisearch' && process.env.MEILI_HOST && process.env.MEILI_MASTER_KEY) {
    messageSchema.plugin(mongoMeili, {
      mongoose,
      host: process.env.MEILI_HOST,
      apiKey: process.env.MEILI_MASTER_KEY,
      indexName: 'messages',
      primaryKey: 'messageId',
    });
  } else if (provider && provider !== 'meilisearch') {
    messageSchema.plugin(mongoSearch, {
      mongoose,
      indexName: 'messages',
      primaryKey: 'messageId',
    });
  }

  return mongoose.models.Message || mongoose.model<t.IMessage>('Message', messageSchema);
}
