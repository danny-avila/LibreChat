import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import type { SeedMessage } from '../db';
import {
  withMongo,
  seedMessages,
  seedConversations,
  deleteConversations,
  deleteMessagesByConversation,
} from '../db';
import { MOCK_ENDPOINTS, selectMockEndpoint, sendMessage } from '../helpers';
import { getE2EUser } from '../../../setup/user';

const NO_PARENT = '00000000-0000-0000-0000-000000000000';
const STREAM_ROUTE = /\/api\/agents\/chat\/stream\//;
/** 8x8 opaque PNG, enough for the browser to decode the image. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGO4o6aGFTEMLQkAF/tKAS/fz4YAAAAASUVORK5CYII=',
  'base64',
);

/** A subagent's background tool can deliver its file after the conversation was loaded: the
 *  load previewed the settled subagent call before any file existed, so the preview names no
 *  child call to route it to, and only the stored transcript holds that call. The file is
 *  persisted onto the original message (as the harvest does) and re-emitted on a later turn's
 *  live stream, the way a `check_background_task` poll delivers it. */
test('a file a subagent background tool delivers after the load renders under the subagent @scenario:subagent-late-background-file-renders', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const conversationId = randomUUID();
  const userMessageId = randomUUID();
  const messageId = randomUUID();
  const suffix = conversationId.slice(0, 8);
  const childCall = `background-child-${suffix}`;
  const attachment = {
    file_id: `${childCall}-file`,
    filename: `${childCall}.png`,
    filepath: `/images/e2e-subagent-late/${childCall}.png`,
    type: 'image/png',
    source: 'local',
    bytes: PNG.length,
    width: 8,
    height: 8,
    messageId,
    conversationId,
    toolCallId: childCall,
  };
  const messages = [
    {
      messageId: userMessageId,
      parentMessageId: NO_PARENT,
      isCreatedByUser: true,
      sender: 'User',
      text: 'Ask the illustrator for a chart in the background.',
    },
    {
      messageId,
      parentMessageId: userMessageId,
      isCreatedByUser: false,
      sender: 'Assistant',
      text: '',
      content: [
        {
          type: 'tool_call',
          tool_call: {
            id: `subagent-${suffix}`,
            name: 'subagent',
            args: JSON.stringify({ subagent_type: 'self', description: 'Draw a chart' }),
            output: 'The chart is rendering in the background.',
            progress: 1,
            subagent_content: [
              {
                type: 'tool_call',
                tool_call: {
                  id: childCall,
                  name: 'execute_code',
                  args: '{}',
                  output: 'Started background task bg_1.',
                  progress: 1,
                },
              },
            ],
          },
        },
        { type: 'text', text: 'The chart is on its way.' },
      ],
    },
  ] as SeedMessage[];

  await seedConversations(getE2EUser().email, [
    { conversationId, title: 'Subagent late file', updatedAt: new Date() },
  ]);
  await seedMessages(getE2EUser().email, conversationId, messages);
  await page.route('**/images/e2e-subagent-late/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG }),
  );

  try {
    const loaded = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/messages/${conversationId}`) && response.status() === 200,
    );
    await page.goto(`/c/${conversationId}`);
    /** The load previews the subagent call with no file to hint: the shape this covers. */
    const preview = JSON.stringify(await (await loaded).json());
    expect(preview).toContain('"subagentContentOmitted":true');
    expect(preview).not.toContain('subagentAttachmentCalls');

    const message = page.locator(`[id="${messageId}"]`);
    await expect(message.getByText('The chart is on its way.')).toBeVisible();
    const image = message.getByRole('img', { name: attachment.filename, exact: true });
    await expect(image).toHaveCount(0);

    /** The background task finished: its file is saved onto the original message. */
    await withMongo((db) =>
      db.collection('messages').updateOne({ messageId }, { $set: { attachments: [attachment] } }),
    );

    /** The next turn's stream re-emits that file for the original message, as a poll does. */
    let injected = false;
    await page.route(STREAM_ROUTE, async (route) => {
      if (injected) {
        await route.continue();
        return;
      }
      injected = true;
      const response = await route.fetch();
      const body = await response.text();
      const frame = `event: message\ndata: ${JSON.stringify({ event: 'attachment', data: attachment })}\n\n`;
      const firstFrameEnd = body.indexOf('\n\n');
      await route.fulfill({
        response,
        body:
          firstFrameEnd < 0
            ? frame + body
            : body.slice(0, firstFrameEnd + 2) + frame + body.slice(firstFrameEnd + 2),
      });
    });

    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);
    const response = await sendMessage(page, `E2E_REPLY:late-file-${suffix}`);
    expect(response.ok()).toBeTruthy();
    await expect(page.getByRole('button', { name: 'Stop generating' })).toBeHidden({
      timeout: 60_000,
    });
    expect(injected).toBe(true);

    await expect(image).toHaveCount(1);
    await expect(image).toBeVisible();
  } finally {
    await deleteMessagesByConversation([conversationId]);
    await deleteConversations([conversationId]);
  }
});
