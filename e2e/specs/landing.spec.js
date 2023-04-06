import {expect, test} from '@playwright/test';

test('landing page', async ({page}) => {
  await page.goto('/');
  expect (await page.title()).toBe('New Chat');
  expect (await page.textContent('#landing-title')).toBe('ChatGPT Clone');
});