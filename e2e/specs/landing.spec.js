import {expect, test} from '@playwright/test';

test('landing page', async ({page}) => {
  await page.goto('http://localhost:3080/');
  // expect (await page.title()).toBe('ChatGPT Clone');
  expect (await page.textContent('#landing-title')).toBe('ChatGPT Clone');
});