import { Page, FullConfig, chromium } from '@playwright/test';
import dotenv from 'dotenv';
dotenv.config();

type User = { username: string; password: string };

async function login(page: Page, user: User) {
  await page.locator('input[name="email"]').fill(user.username);
  await page.locator('input[name="password"]').fill(user.password);
  await page.locator('input[name="password"]').press('Enter');
}

async function authenticate(config: FullConfig, user: User) {
  console.log('🤖: global setup has been started');
  const { baseURL, storageState } = config.projects[0].use;
  console.log('🤖: using baseURL', baseURL);
  console.dir(user, { depth: null });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  console.log('🤖: 🗝  authenticating user:', user.username);

  if (!baseURL) {
    throw new Error('🤖: baseURL is not defined');
  }
  await page.goto(baseURL);
  await login(page, user);
  // const loginPromise = page.getByTestId('landing-title').waitFor({ timeout: 25000 }); // due to GH Actions load time
  // if (process.env.NODE_ENV === 'ci') {
  //   await page.screenshot({ path: 'login-screenshot.png' });
  // }
  // await loginPromise;
  await page.waitForURL(`${baseURL}/chat/new`);
  console.log('🤖: ✔️  user successfully authenticated');
  // Set localStorage before navigating to the page
  await page.context().addInitScript(() => {
    localStorage.setItem('navVisible', 'true');
  });
  console.log('🤖: ✔️  localStorage: set Nav as Visible', storageState);
  await page.context().storageState({ path: storageState as string });
  console.log('🤖: ✔️  authentication state successfully saved in', storageState);
  await browser.close();
  console.log('🤖: global setup has been finished');
}

export default authenticate;
