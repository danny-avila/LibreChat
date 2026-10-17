import { expect, test } from '@playwright/test';

const NO_PARENT = '00000000-0000-0000-0000-000000000000';
/** 1x1 transparent PNG, enough for the browser to decode the image. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const imageAttachment = (conversationId: string, toolCallId: string, filename: string) => ({
  file_id: `${toolCallId}-file`,
  filename,
  filepath: `/images/e2e-subagent/${filename}`,
  type: 'image/png',
  source: 'local',
  bytes: PNG.length,
  width: 1,
  height: 1,
  messageId: `${conversationId}-assistant`,
  conversationId,
  toolCallId,
});

const imageToolCall = (id: string) => ({
  type: 'tool_call',
  tool_call: { id, name: 'image_gen_oai', args: '{}', output: 'Image generated', progress: 1 },
});

/** The subagent's own tool calls exist only inside `subagent_content`, the
 *  shape the backend persists at save time, so the conversation is served
 *  from that stored shape rather than produced by the mock model. */
test('an image a subagent tool saved renders once under the subagent after reload @scenario:subagent-nested-tool-images-render', async ({
  page,
}) => {
  const conversationId = `subagent-images-${Date.now()}`;
  const parentCall = `${conversationId}-subagent`;
  const childCall = `${conversationId}-child-image`;
  const grandchildCall = `${conversationId}-grandchild-image`;
  const directCall = `${conversationId}-direct-image`;
  const now = new Date(0).toISOString();
  const base = { conversationId, createdAt: now, updatedAt: now };
  const messages = [
    {
      ...base,
      messageId: `${conversationId}-user`,
      parentMessageId: NO_PARENT,
      isCreatedByUser: true,
      sender: 'User',
      text: 'Ask the illustrator for a red cat.',
    },
    {
      ...base,
      messageId: `${conversationId}-assistant`,
      parentMessageId: `${conversationId}-user`,
      isCreatedByUser: false,
      sender: 'Assistant',
      endpoint: 'Mock Provider A',
      model: 'mock-model-a',
      text: '',
      content: [
        {
          type: 'tool_call',
          tool_call: {
            id: parentCall,
            name: 'subagent',
            args: JSON.stringify({ subagent_type: 'self', description: 'Draw a red cat' }),
            output: 'The illustrator drew a red cat.',
            progress: 1,
            subagent_content: [
              imageToolCall(childCall),
              {
                type: 'tool_call',
                tool_call: {
                  id: `${conversationId}-nested-subagent`,
                  name: 'subagent',
                  args: JSON.stringify({ subagent_type: 'self', description: 'Add a hat' }),
                  output: 'Added a hat.',
                  progress: 1,
                  subagent_content: [imageToolCall(grandchildCall)],
                },
              },
            ],
          },
        },
        imageToolCall(directCall),
        { type: 'text', text: 'Here is the red cat.' },
      ],
      attachments: [
        imageAttachment(conversationId, childCall, 'red-cat.png'),
        imageAttachment(conversationId, grandchildCall, 'red-cat-hat.png'),
        imageAttachment(conversationId, directCall, 'direct-cat.png'),
      ],
    },
  ];
  const conversation = {
    ...base,
    title: 'Subagent images',
    endpoint: 'Mock Provider A',
    endpointType: 'custom',
    model: 'mock-model-a',
  };
  await page.route(`**/api/convos/${conversationId}*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(conversation),
    }),
  );
  await page.route(`**/api/messages/${conversationId}*`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(messages) }),
  );
  await page.route('**/images/e2e-subagent/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG }),
  );

  await page.goto(`/c/${conversationId}`);
  const message = page.locator(`[id="${conversationId}-assistant"]`);
  await expect(message.getByText('Here is the red cat.')).toBeVisible();

  for (const filename of ['red-cat.png', 'red-cat-hat.png', 'direct-cat.png']) {
    const image = message.getByRole('img', { name: filename });
    await expect(image).toHaveCount(1);
    await expect(image).toBeVisible();
  }

  await page.reload();
  await expect(message.getByRole('img', { name: 'red-cat.png' })).toHaveCount(1);
  await expect(message.getByRole('img', { name: 'red-cat-hat.png' })).toHaveCount(1);
});
