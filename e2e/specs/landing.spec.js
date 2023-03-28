import {expect, test} from '@playwright/test';

test('landing page', async ({page}) => {
  await page.goto('/');
  expect (await page.title()).toBe('ChatGPT Clone');
  expect (await page.textContent('h1')).toBe('ChatGPT Clone');
});