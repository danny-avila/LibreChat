import { Page, FullConfig, chromium } from '@playwright/test';

type User = {username: string; password: string};

async function login(page: Page, user: User) {
  await page.locator('input[name="email"]').fill(user.username);
  await page.locator('input[name="password"]').fill(user.password);
  await page.locator('button[type="submit"]').click();
}

async function authenticate(config: FullConfig, user: User) {
  console.log('🤖: global setup has been started');
  const { baseURL, storageState } = config.projects[0].use;
  console.log('🤖: using baseURL', baseURL);
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  console.log('🤖: 🗝  authenticating user:', user.username);
  await page.goto(baseURL);
  await login(page, user);
  await page.locator('h1:has-text("LibreChat")').waitFor();
  const cookies = await context.cookies();
  console.log('🤖: ✔️  user successfully authenticated');
  // Set localStorage before navigating to the page
  const tokenCookie = cookies.find(cookie => cookie.name === 'token');
  const refreshTokenCookie = cookies.find(cookie => cookie.name === 'refreshToken');
  const token = tokenCookie ? tokenCookie.value : null;
  const refreshToken = refreshTokenCookie ? refreshTokenCookie.value : null;
  console.log('Token:', token);
  console.log('Refresh Token:', refreshToken);
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
