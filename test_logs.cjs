const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', error => console.log('BROWSER ERROR:', error.message));
  await page.goto('http://localhost:3091', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const body = await page.evaluate(() => document.body.innerHTML);
  console.log('DOM BODY:', body);
  await browser.close();
})();
