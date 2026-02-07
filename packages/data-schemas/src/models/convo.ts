import type * as t from '~/types';
import mongoMeili from '~/models/plugins/mongoMeili';
import mongoSearch from '~/models/plugins/mongoSearch';
import { detectSearchProvider } from '~/models/plugins/search';
import convoSchema from '~/schema/convo';

/**
 * Creates or returns the Conversation model using the provided mongoose instance and schema.
 *
 * Supports multiple search backends via the search provider abstraction:
 * - MeiliSearch (default, backward compatible with existing MEILI_HOST/MEILI_MASTER_KEY)
 * - OpenSearch (via SEARCH_PROVIDER=opensearch or OPENSEARCH_HOST)
 * - Typesense (via SEARCH_PROVIDER=typesense or TYPESENSE_HOST + TYPESENSE_API_KEY)
 *
 * For MeiliSearch, the original mongoMeili plugin is used to maintain full backward compatibility.
 * For other providers, the new mongoSearch plugin is used.
 */
export function createConversationModel(mongoose: typeof import('mongoose')) {
  const provider = detectSearchProvider();

  if (provider === 'meilisearch' && process.env.MEILI_HOST && process.env.MEILI_MASTER_KEY) {
    convoSchema.plugin(mongoMeili, {
      mongoose,
      host: process.env.MEILI_HOST,
      apiKey: process.env.MEILI_MASTER_KEY,
      /** Note: Will get created automatically if it doesn't exist already */
      indexName: 'convos',
      primaryKey: 'conversationId',
    });
  } else if (provider && provider !== 'meilisearch') {
    convoSchema.plugin(mongoSearch, {
      mongoose,
      indexName: 'convos',
      primaryKey: 'conversationId',
    });
  }

  return (
    mongoose.models.Conversation || mongoose.model<t.IConversation>('Conversation', convoSchema)
  );
}
