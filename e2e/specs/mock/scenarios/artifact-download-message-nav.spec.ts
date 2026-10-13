import { expect, test } from '@playwright/test';

const NO_PARENT = '00000000-0000-0000-0000-000000000000';

test.use({ viewport: { width: 1280, height: 800 } });

test('an artifact download stays clickable beneath the message navigation rail @scenario:artifact-download-clears-message-nav', async ({
  page,
}) => {
  const conversationId = `artifact-nav-${Date.now()}`;
  const filename = 'workbook.xlsx';
  const fileId = `${conversationId}-file`;
  const toolCallId = `${conversationId}-tool`;
  const now = new Date(0).toISOString();
  const base = { conversationId, createdAt: now, updatedAt: now };
  const messages = [
    {
      ...base,
      messageId: `${conversationId}-user-1`,
      parentMessageId: NO_PARENT,
      isCreatedByUser: true,
      sender: 'User',
      text: 'Create a workbook.',
    },
    {
      ...base,
      messageId: `${conversationId}-assistant-1`,
      parentMessageId: `${conversationId}-user-1`,
      isCreatedByUser: false,
      sender: 'Assistant',
      endpoint: 'Mock Provider A',
      model: 'mock-model-a',
      text: 'I will prepare it.',
    },
    {
      ...base,
      messageId: `${conversationId}-user-2`,
      parentMessageId: `${conversationId}-assistant-1`,
      isCreatedByUser: true,
      sender: 'User',
      text: 'Finish the spreadsheet.',
    },
    {
      ...base,
      messageId: `${conversationId}-assistant-2`,
      parentMessageId: `${conversationId}-user-2`,
      isCreatedByUser: false,
      sender: 'Assistant',
      endpoint: 'Mock Provider A',
      model: 'mock-model-a',
      text: '',
      content: [
        {
          type: 'tool_call',
          tool_call: {
            id: toolCallId,
            name: 'execute_code',
            args: '{}',
            output: 'done',
            progress: 1,
          },
        },
        {
          type: 'text',
          text: Array.from({ length: 80 }, (_, i) => `Analysis line ${i + 1}.`).join('\n\n'),
        },
      ],
      attachments: [
        {
          file_id: fileId,
          filename,
          filepath: `/api/files/code/download/test-session/${fileId}`,
          type: 'execute_code',
          source: 'local',
          bytes: 2048,
          messageId: `${conversationId}-assistant-2`,
          conversationId,
          toolCallId,
          status: 'ready',
          text: '<table><tr><td>ready</td></tr></table>',
          textFormat: 'html',
        },
      ],
    },
  ];
  const conversation = {
    ...base,
    title: 'Artifact navigation overlap',
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
  let downloadRequests = 0;
  await page.route('**/api/files/code/download/test-session/**', (route) => {
    downloadRequests += 1;
    return route.fulfill({ status: 200, body: 'workbook bytes' });
  });

  await page.goto(`/c/${conversationId}`);
  const download = page.getByRole('button', { name: `Download ${filename}` });
  await expect(download).toBeVisible();
  const nav = page.locator('nav[aria-keyshortcuts="Shift+Alt+M"]');
  await expect(nav).toBeVisible();
  await download.scrollIntoViewIfNeeded();
  await download.evaluate((el) => {
    const rail = document.querySelector('nav[aria-keyshortcuts="Shift+Alt+M"]');
    if (!rail) {
      throw new Error('Message navigation rail is missing');
    }
    const railBox = rail.getBoundingClientRect();
    const targetY = railBox.top + railBox.height / 2;
    let scroller = el.parentElement;
    while (
      scroller &&
      !(
        scroller.scrollHeight > scroller.clientHeight + 10 &&
        /auto|scroll/.test(getComputedStyle(scroller).overflowY)
      )
    ) {
      scroller = scroller.parentElement;
    }
    if (!scroller) {
      throw new Error('Message scroller is missing');
    }
    const box = el.getBoundingClientRect();
    scroller.scrollTop += box.top + box.height / 2 - targetY;
  });

  const box = await download.boundingBox();
  const railBox = await nav.boundingBox();
  expect(box).not.toBeNull();
  expect(railBox).not.toBeNull();
  const center = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
  expect(center.y).toBeGreaterThan(railBox!.y);
  expect(center.y).toBeLessThan(railBox!.y + railBox!.height);
  expect(box!.x + box!.width).toBeLessThan(railBox!.x);
  await page.mouse.click(center.x, center.y);
  await expect.poll(() => downloadRequests).toBe(1);
});
