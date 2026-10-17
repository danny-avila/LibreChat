import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { AgentDetail } from '../agents.helpers';
import { cleanupAgent } from '../agents.helpers';
import { withMongo } from '../db';
import {
  MOCK_ENDPOINTS,
  NEW_CHAT_PATH,
  uniqueName,
  requestJson,
  getRagQueries,
  getAccessToken,
  getRagEmbedded,
  resetProvisioning,
  sendMessageAndWaitForCompletion,
} from '../helpers';

/**
 * Files uploaded for File Search before v0.8.8 carry `embedded: true` but no
 * `metadata.embeddedEntities`. They must stay searchable without being embedded a second
 * time, which would store a duplicate copy under the same file_id (#16843).
 */
test.describe('legacy File Search embeddings', () => {
  test('an agent file embedded before namespace tracking is searched without re-embedding @scenario:legacy-search-file-not-re-embedded', async ({
    page,
  }) => {
    test.setTimeout(180000);
    let agentId: string | undefined;
    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });

    try {
      const token = await getAccessToken(page);
      const agent = await requestJson<AgentDetail>(page, {
        path: '/api/agents',
        token,
        method: 'POST',
        body: {
          name: uniqueName('legacy-search-agent'),
          description: 'Legacy File Search embedding fixture.',
          instructions: 'Search the attached files.',
          provider: MOCK_ENDPOINTS[0].label,
          model: MOCK_ENDPOINTS[0].model,
          tools: ['file_search'],
        },
      });
      agentId = agent.id;

      const fileId = randomUUID();
      const upload = await page.request.post('/api/files', {
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          endpoint: MOCK_ENDPOINTS[0].label,
          endpointType: 'custom',
          agent_id: agentId,
          tool_resource: 'file_search',
          file_id: fileId,
          file: {
            name: `${uniqueName('legacy-search')}.txt`,
            mimeType: 'text/plain',
            buffer: Buffer.from('Legacy search fixture text.'),
          },
        },
      });
      expect(upload.ok(), await upload.text()).toBeTruthy();
      await expect
        .poll(async () => (await getRagEmbedded(page)).map((e) => e.file_id), { timeout: 15000 })
        .toContain(fileId);

      /* Reshape the record into what v0.8.7 wrote: embedded, with no namespace list. */
      const reshaped = await withMongo((db) =>
        db
          .collection('files')
          .updateOne(
            { file_id: fileId, embedded: true },
            { $unset: { 'metadata.embeddedEntities': '' } },
          ),
      );
      expect(reshaped.matchedCount).toBe(1);
      await resetProvisioning(page);

      await page.goto(`${NEW_CHAT_PATH}?agent_id=${encodeURIComponent(agentId)}`, {
        timeout: 10000,
      });
      await sendMessageAndWaitForCompletion(page, `E2E_FILE_SEARCH:${uniqueName('legacy')}`);

      await expect
        .poll(async () => (await getRagQueries(page)).filter((q) => q.file_id === fileId).length, {
          timeout: 30000,
        })
        .toBeGreaterThan(0);
      expect(
        (await getRagEmbedded(page)).filter((e) => e.file_id === fileId),
        'a legacy embedded File Search file must not be embedded again',
      ).toHaveLength(0);
    } finally {
      await cleanupAgent(page, agentId);
    }
  });
});
